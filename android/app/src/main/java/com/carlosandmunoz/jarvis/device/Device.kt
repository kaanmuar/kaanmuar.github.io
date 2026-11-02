package com.carlosandmunoz.jarvis.device

import android.app.Activity
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.os.Build
import android.provider.Settings
import androidx.window.layout.FoldingFeature
import androidx.window.layout.WindowLayoutInfo
import androidx.window.layout.WindowMetricsCalculator
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlin.math.min
import kotlin.math.roundToInt

/** What Jarvis runs on (#2068). The same kinds as the web (JarvisCore.DEVICE_KINDS), so the server reads both alike. */
enum class Kind(val wire: String, val label: String) {
    Phone("phone", "Phone"),
    FoldableFolded("foldable-folded", "Foldable, folded"),
    FoldableOpen("foldable-open", "Foldable, open"),
    Tablet("tablet", "Tablet"),
    Desktop("desktop", "Desktop"),
}

enum class Posture(val wire: String, val label: String) { Flat("flat", "flat"), Tabletop("tabletop", "tabletop"), Book("book", "half open like a book") }

/** The fold in dp from the window's top-left. Vertical when it runs top to bottom. */
data class Hinge(val vertical: Boolean, val halfOpen: Boolean, val left: Float, val top: Float, val right: Float, val bottom: Float)

data class Form(
    val kind: Kind = Kind.Phone,
    val posture: Posture? = null,
    val widthDp: Int = 0,
    val heightDp: Int = 0,
    val name: String = "",
    val model: String = "",
    val dex: Boolean = false,
    val windowed: Boolean = false,
    val hinge: Hinge? = null,
) {
    val tabletop get() = posture == Posture.Tabletop && hinge != null && !hinge.vertical

    /** A side rail instead of the bottom dock: wide windows, and tabletop, where the lower half holds Ask. */
    val rail get() = widthDp >= 600 || tabletop

    /** Ask opens as a pane beside the tabs instead of over them. */
    val askBeside get() = rail && !tabletop

    /** The pane starts open when two panel columns still fit beside it, or when the fold already splits the screen. */
    val askOpen get() = widthDp >= 1100 || posture == Posture.Book

    /** Right of a vertical fold, so the crease falls between the tabs and Ask; elsewhere two fifths of the window. */
    val askWidthDp: Int get() {
        val beside = hinge?.takeIf { it.vertical }?.let { (widthDp - it.right).roundToInt() }
        return beside?.coerceIn(300, widthDp * 3 / 5) ?: min(400, widthDp * 2 / 5).coerceAtLeast(300)
    }

    val label: String get() = listOfNotNull(
        kind.label,
        posture?.takeIf { it != Posture.Flat }?.label,
        if (dex) "Samsung DeX" else if (windowed) "in a window" else null,
        "$widthDp×$heightDp dp".takeIf { widthDp > 0 },
    ).joinToString(" · ")

    fun json(id: String): JsonObject = buildJsonObject {
        put("id", id); put("app", "android"); put("kind", kind.wire); posture?.let { put("posture", it.wire) }
        put("width", widthDp); put("height", heightDp); put("name", name); put("model", model); put("dex", dex); put("windowed", windowed)
    }
}

object Device {
    private val FOLD_MODEL = Regex("SM-F9\\d\\d|Fold|OnePlus Open|CPH2551", RegexOption.IGNORE_CASE)
    private const val SEEN_FOLD = "device.foldable"

    /** Panel columns for the width the tabs get. */
    fun columns(contentDp: Int) = when { contentDp >= 1100 -> 3; contentDp >= 640 -> 2; else -> 1 }

    /**
     * [displaySmallestDp] is the screen's shorter side, not the window's: a Fold's cover screen is under 600 and its inner screen over it.
     * Android reports the fold only while it crosses the window, so a known foldable without one is told apart by its screen.
     */
    fun classify(foldable: Boolean, hinge: Hinge?, displaySmallestDp: Int, desktop: Boolean): Pair<Kind, Posture?> = when {
        desktop -> Kind.Desktop to null
        hinge != null -> Kind.FoldableOpen to when { !hinge.halfOpen -> Posture.Flat; hinge.vertical -> Posture.Book; else -> Posture.Tabletop }
        foldable -> if (displaySmallestDp >= 600) Kind.FoldableOpen to Posture.Flat else Kind.FoldableFolded to null
        displaySmallestDp >= 600 -> Kind.Tablet to null
        else -> Kind.Phone to null
    }

    fun read(activity: Activity, layout: WindowLayoutInfo?, remember: (String) -> Boolean, mark: (String) -> Unit): Form {
        val density = activity.resources.displayMetrics.density
        val calc = WindowMetricsCalculator.getOrCreate()
        val window = calc.computeCurrentWindowMetrics(activity).bounds
        val display = calc.computeMaximumWindowMetrics(activity).bounds
        val fold = layout?.displayFeatures?.filterIsInstance<FoldingFeature>()?.firstOrNull()
        if (fold != null && !remember(SEEN_FOLD)) mark(SEEN_FOLD)
        val hinge = fold?.let { f ->
            Hinge(f.orientation == FoldingFeature.Orientation.VERTICAL, f.state == FoldingFeature.State.HALF_OPENED,
                f.bounds.left / density, f.bounds.top / density, f.bounds.right / density, f.bounds.bottom / density)
        }
        val pm = activity.packageManager
        val foldable = fold != null || remember(SEEN_FOLD) || FOLD_MODEL.containsMatchIn(Build.MODEL) ||
            (Build.VERSION.SDK_INT >= 30 && pm.hasSystemFeature(PackageManager.FEATURE_SENSOR_HINGE_ANGLE))
        val config = activity.resources.configuration
        val dex = dex(config)
        val desktop = dex || pm.hasSystemFeature("org.chromium.arc") || pm.hasSystemFeature("org.chromium.arc.device_management") ||
            (config.uiMode and Configuration.UI_MODE_TYPE_MASK) == Configuration.UI_MODE_TYPE_DESK
        val (kind, posture) = classify(foldable, hinge, (min(display.width(), display.height()) / density).roundToInt(), desktop)
        return Form(kind, posture, (window.width() / density).roundToInt(), (window.height() / density).roundToInt(), name(activity), Build.MODEL,
            dex, activity.isInMultiWindowMode, hinge)
    }

    /** Samsung's own check for DeX: the field only exists on Samsung builds. */
    private fun dex(config: Configuration) = runCatching {
        val c = config.javaClass
        c.getField("SEM_DESKTOP_MODE_ENABLED").getInt(c) == c.getField("semDesktopModeEnabled").getInt(config)
    }.getOrDefault(false)

    /** The name the owner sees in the phone's settings ("Galaxy Z Fold8 Ultra"), else the maker and model. */
    fun name(activity: Activity): String =
        runCatching { Settings.Global.getString(activity.contentResolver, Settings.Global.DEVICE_NAME) }.getOrNull()?.takeIf { it.isNotBlank() }
            ?: (Build.MANUFACTURER.replaceFirstChar { it.uppercase() } + " " + Build.MODEL)
}
