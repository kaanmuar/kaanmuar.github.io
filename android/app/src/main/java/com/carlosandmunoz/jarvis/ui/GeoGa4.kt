package com.carlosandmunoz.jarvis.ui

import com.carlosandmunoz.jarvis.data.fmt
import com.carlosandmunoz.jarvis.data.num
import kotlinx.serialization.json.JsonObject
import kotlin.math.roundToInt
import kotlin.math.sign

/** The Map's GA4 numbers per country (#3282), twin of js/admin-jarvis-geo-ga4.js: visitors, engaged sessions and key
 *  events for every country GA4 sees, against the span before, from the geo rows (functions/jarvis-geo-ga4.js). */
object GeoGa4 {
    /** The change from before to now in percent, whole; null when either is missing or before was 0. */
    fun change(now: Double?, before: Double?): Int? =
        if (now == null || before == null || before == 0.0) null else ((now - before) / before * 100).roundToInt()

    // One KPI: the number now and the change against before ("+12% vs 40", "new" when before had none).
    private fun kpi(label: String, now: Double?, before: Double?, value: String? = null): KpiData {
        val pct = change(now, before)
        val delta = when {
            now == null -> null
            pct != null -> "${if (pct > 0) "+" else ""}$pct% vs ${fmt(before)}"
            now > 0 -> "new"
            else -> null
        }
        return KpiData(label, value ?: if (now == null) "—" else fmt(now), delta, pct?.sign ?: if ((now ?: 0.0) > 0) 1 else 0)
    }

    /** The country sheet's GA4 KPIs: visitors, engaged sessions with the engagement rate, and key events. */
    fun kpis(r: JsonObject): List<KpiData> = listOf(
        kpi("Visitors (GA4)", r.num("visitors"), r.num("visitorsPrior")),
        kpi("Engaged sessions · rate", r.num("engaged"), r.num("engagedPrior"), fmt(r.num("engaged") ?: 0.0) + (r.num("engagementRate")?.let { " · ${fmt(it)}%" } ?: "")),
        kpi("Key events", r.num("keyEvents"), r.num("keyEventsPrior"))
    )
}
