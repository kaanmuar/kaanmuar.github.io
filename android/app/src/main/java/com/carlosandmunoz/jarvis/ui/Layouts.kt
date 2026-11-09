package com.carlosandmunoz.jarvis.ui

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.LayoutIdParentData
import androidx.compose.ui.layout.Measurable
import androidx.compose.ui.node.ModifierNodeElement
import androidx.compose.ui.node.ParentDataModifierNode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.carlosandmunoz.jarvis.data.obj
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Section layout per tab (#2809): jarvis_settings layout[tab] = { order, hidden } of panel ids, the same entry the web edits.
 * The web's panelSlug, applyLayout, layoutMove and keepLayout from js/admin-jarvis-core.js. Each panel passes the id of its web panel
 * (#2866, tests/unit/jarvis-panel-ids.test.js); before that the app saved title slugs, which [alias] still reads.
 */
object Layouts {
    data class Saved(val order: List<String> = emptyList(), val hidden: List<String> = emptyList())
    data class Applied(val all: List<String>, val order: List<String>, val hidden: List<String>)

    private val ID = Regex("^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$")
    private const val MAX = 200

    fun slug(title: String): String {
        val s = title.split(" · ")[0].replace(Regex("\\s*\\([^)]*\\)\\s*$"), "").lowercase()
            .replace(Regex("[^a-z0-9]+"), "-").trim('-').take(80).trimEnd('-')
        return s.ifEmpty { "panel" }
    }

    fun ids(list: List<String>?): List<String> = list.orEmpty().filter { ID.matches(it) }.distinct().take(MAX)

    /** base, then each id of ref that base lacks, right after the nearest id before it in ref that is already placed (first when none is). */
    fun weave(base: List<String>, ref: List<String>): List<String> {
        val out = base.toMutableList()
        val placed = out.toMutableSet()
        ref.forEachIndexed { i, id ->
            if (id in placed) return@forEachIndexed
            var at = 0
            for (k in i - 1 downTo 0) { val j = out.indexOf(ref[k]); if (j >= 0) { at = j + 1; break } }
            out.add(at, id)
            placed += id
        }
        return out
    }

    /** The panels a tab shows, in the saved order: new panels at their default place, saved ids no panel has any more ignored. */
    fun apply(defaults: List<String>, layout: Saved?): Applied {
        val present = defaults.distinct()
        val all = weave(ids(layout?.order).filter { it in present }, present)
        val hide = ids(layout?.hidden).toSet()
        return Applied(all, all.filter { it !in hide }, all.filter { it in hide })
    }

    /** The layout with each old title slug read as the id its panel has now; an id a panel has is never renamed, so the web's stay as they are. */
    fun alias(layout: Saved?, present: List<String>, legacy: Map<String, String>): Saved? {
        if (layout == null || legacy.isEmpty()) return layout
        val have = present.toSet()
        fun map(list: List<String>) = list.map { id -> legacy[id]?.takeIf { id !in have && it in have } ?: id }.distinct()
        return Saved(map(layout.order), map(layout.hidden))
    }

    /** One step up (-1) or down (1) past the next shown panel; hidden panels keep their place. */
    fun move(all: List<String>, hidden: List<String>, id: String, step: Int): List<String> {
        val hide = hidden.toSet()
        val seen = all.filter { it == id || it !in hide }
        val at = seen.indexOf(id)
        val k = at + step
        if (at < 0 || k < 0 || k >= seen.size) return all
        val out = all.filter { it != id }.toMutableList()
        val j = out.indexOf(seen[k])
        out.add(if (step < 0) j else j + 1, id)
        return out
    }

    /** What to save after an edit: this side's order and hidden panels, with the ids it did not show (the web's, or empty panels) kept. */
    fun keep(prev: Saved?, all: List<String>, hidden: List<String>, shown: List<String>): Saved {
        val mine = shown.toSet()
        return Saved(weave(ids(all), ids(prev?.order)).take(MAX), ids(ids(prev?.hidden).filter { it !in mine } + ids(hidden)))
    }

    fun read(snapshot: JsonObject?, tab: String): Saved? {
        val t = snapshot.obj("settings").obj("layout").obj(tab) ?: return null
        fun list(key: String) = (t[key] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.takeIf { p -> p.isString }?.content }
        return Saved(ids(list("order")), ids(list("hidden")))
    }

    fun json(layout: Saved?): JsonElement = layout?.let {
        JsonObject(mapOf("order" to JsonArray(it.order.map(::JsonPrimitive)), "hidden" to JsonArray(it.hidden.map(::JsonPrimitive))))
    } ?: JsonNull

    /** The snapshot with one tab's layout replaced (null removes it), or with the whole layout from a settings-save reply. */
    fun patch(snapshot: JsonObject?, tab: String, layout: Saved?): JsonObject? {
        val all = snapshot.obj("settings").obj("layout").orEmpty().toMutableMap()
        if (layout == null) all.remove(tab) else all[tab] = json(layout)
        return withLayout(snapshot, JsonObject(all))
    }

    fun withLayout(snapshot: JsonObject?, layout: JsonObject): JsonObject? {
        snapshot ?: return null
        val settings = snapshot.obj("settings").orEmpty()
        return JsonObject(snapshot + ("settings" to JsonObject(settings + ("layout" to layout))))
    }
}

/** The tab whose panels a [Masonry] arranges, and its saved layout; null outside the tabs (Settings, Ask). */
val LocalLayoutTab = compositionLocalOf<String?> { null }
val LocalLayout = compositionLocalOf<Layouts.Saved?> { null }

/** The tab being edited and the ids each tab drew last, in their default order. */
object Arrange {
    data class Edit(val tab: String, val all: List<String>, val hidden: List<String>, val dirty: Boolean = false, val reset: Boolean = false)

    val edit = mutableStateOf<Edit?>(null)
    val defaults = mutableStateMapOf<String, List<String>>()
    internal val titles = HashMap<String, String>()
    private val legacy = HashMap<String, HashMap<String, String>>()

    /** A panel drawn on [tab]: its title for Add back, and the slug of that title it was saved under before #2866. */
    fun seen(tab: String, id: String, title: String) {
        titles["$tab/$id"] = title
        val slug = Layouts.slug(title)
        if (slug != id) legacy.getOrPut(tab) { HashMap() }[slug] = id
    }

    /** [saved] with the old slug ids of the panels [tab] drew read as their ids. */
    fun aliased(tab: String, saved: Layouts.Saved?) = Layouts.alias(saved, defaults[tab].orEmpty(), legacy[tab].orEmpty())

    fun editing(tab: String?) = edit.value?.takeIf { tab != null && it.tab == tab }
    fun movable(tab: String?, id: String) = editing(tab) != null && defaults[tab]?.contains(id) == true

    fun start(tab: String, saved: Layouts.Saved?) {
        val l = Layouts.apply(defaults[tab].orEmpty(), aliased(tab, saved))
        edit.value = Edit(tab, l.all, l.hidden)
    }

    fun change(act: String, id: String = "") {
        val e = edit.value ?: return
        val ids = defaults[e.tab].orEmpty()
        val all = Layouts.apply(ids, Layouts.Saved(e.all)).all
        edit.value = when (act) {
            "reset" -> e.copy(all = ids, hidden = emptyList(), reset = true, dirty = true)
            "up", "down" -> e.copy(all = Layouts.move(all, e.hidden, id, if (act == "up") -1 else 1), dirty = true)
            "hide" -> e.copy(all = all, hidden = e.hidden + id, dirty = true)
            "show" -> e.copy(all = all, hidden = e.hidden - id, dirty = true)
            else -> e
        }
    }

    /** Ends the edit and hands a changed layout to [save]; a reset that is still the default saves null. */
    fun done(saved: Layouts.Saved?, save: (Layouts.Saved?) -> Unit) {
        val e = edit.value ?: return
        edit.value = null
        if (!e.dirty) return
        val ids = defaults[e.tab].orEmpty()
        save(if (e.reset && e.hidden.isEmpty() && e.all == ids) null else Layouts.keep(if (e.reset) null else aliased(e.tab, saved), e.all, e.hidden, ids))
    }

    fun title(tab: String, id: String) = titles["$tab/$id"] ?: id
}

/** A panel's id, read by [Masonry]; the layout id under it (WIDE) still reads through. */
internal class PanelSlot(val id: String, private val inner: Any?) : LayoutIdParentData {
    override val layoutId: Any get() = (inner as? LayoutIdParentData)?.layoutId ?: this
}

internal data class PanelIdElement(val id: String) : ModifierNodeElement<PanelIdNode>() {
    override fun create() = PanelIdNode(id)
    override fun update(node: PanelIdNode) { node.id = id }
}

internal class PanelIdNode(var id: String) : Modifier.Node(), ParentDataModifierNode {
    override fun Density.modifyParentData(parentData: Any?): Any = PanelSlot(id, parentData)
}

/** The items in layout order, hidden panels left out; each item without an id keeps its slot. */
internal fun arranged(items: List<Measurable>, tab: String?, saved: Layouts.Saved?): List<Measurable> {
    val id = { m: Measurable -> (m.parentData as? PanelSlot)?.id }
    val ids = items.mapNotNull(id).distinct()
    if (tab == null || ids.isEmpty()) return items
    if (Arrange.defaults[tab] != ids) Arrange.defaults[tab] = ids
    val e = Arrange.editing(tab)
    val l = Layouts.apply(ids, e?.let { Layouts.Saved(it.all, it.hidden) } ?: Arrange.aliased(tab, saved))
    val rank = l.all.withIndex().associate { it.value to it.index }
    val sorted = items.filter { id(it) != null }.sortedBy { rank[id(it)] ?: 0 }.iterator()
    val hide = l.hidden.toSet()
    return items.map { if (id(it) != null) sorted.next() else it }.filter { id(it) !in hide }
}

/** Above a tab's panels: Edit layout, and while editing the help line, Reset, Done and the hidden sections with Add back. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun LayoutBar(tab: String, savedOf: (String) -> Layouts.Saved?, save: (String, Layouts.Saved?) -> Unit) {
    val edit = Arrange.editing(tab)
    val saved = savedOf(tab)
    val finish = { Arrange.done(saved) { save(tab, it) } }
    // Another tab's edit ends when this one shows; a fold or unfold keeps it going.
    LaunchedEffect(tab) { Arrange.edit.value?.takeIf { it.tab != tab }?.let { e -> Arrange.done(savedOf(e.tab)) { save(e.tab, it) } } }
    val hidden = Layouts.apply(Arrange.defaults[tab].orEmpty(), if (edit != null) Layouts.Saved(edit.all, edit.hidden) else Arrange.aliased(tab, saved)).hidden
    if (edit == null) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp), horizontalArrangement = Arrangement.End, verticalAlignment = Alignment.CenterVertically) {
            if (hidden.isNotEmpty()) Muted("${hidden.size} hidden")
            TextButton(onClick = { Arrange.start(tab, saved) }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Edit layout", color = J.cyan) }
        }
        return
    }
    Column(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 6.dp).border(1.dp, J.cyan.copy(alpha = 0.7f), RoundedCornerShape(14.dp)).padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Muted("Editing this tab: ↑ ↓ move a section, Hide puts it away.")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { Arrange.change("reset") }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Reset to default") }
            Button(onClick = finish, modifier = Modifier.heightIn(min = 48.dp), colors = ButtonDefaults.buttonColors(containerColor = J.cyan)) { Text("Done") }
        }
        Text("HIDDEN SECTIONS" + if (hidden.isNotEmpty()) " (${hidden.size})" else "", fontFamily = Mono, fontSize = 11.sp, letterSpacing = 1.4.sp, color = J.muted)
        if (hidden.isEmpty()) Muted("None. Hide a section to keep it here.")
        else FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            hidden.forEach { id ->
                val name = Arrange.title(tab, id)
                Row(Modifier.border(1.dp, J.line, RoundedCornerShape(10.dp)).padding(start = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(name, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 200.dp))
                    TextButton(onClick = { Arrange.change("show", id) }, modifier = Modifier.heightIn(min = 48.dp).semantics { contentDescription = "Add back $name" }) { Text("Add back", color = J.cyan) }
                }
            }
        }
    }
}

/** ↑ ↓ Hide under a panel's header while its tab is edited. */
@Composable
internal fun PanelTools(tab: String, id: String, title: String) {
    val e = Arrange.editing(tab) ?: return
    val shown = e.all.filter { it !in e.hidden && Arrange.defaults[tab]?.contains(it) == true }
    val at = shown.indexOf(id)
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.End), verticalAlignment = Alignment.CenterVertically) {
        OutlinedButton(onClick = { Arrange.change("up", id) }, enabled = at > 0, modifier = Modifier.heightIn(min = 48.dp).semantics { contentDescription = "Move $title up" }) { Text("↑") }
        OutlinedButton(onClick = { Arrange.change("down", id) }, enabled = at in 0 until shown.size - 1, modifier = Modifier.heightIn(min = 48.dp).semantics { contentDescription = "Move $title down" }) { Text("↓") }
        OutlinedButton(onClick = { Arrange.change("hide", id) }, modifier = Modifier.heightIn(min = 48.dp).semantics { contentDescription = "Hide $title" }) { Text("Hide") }
    }
}
