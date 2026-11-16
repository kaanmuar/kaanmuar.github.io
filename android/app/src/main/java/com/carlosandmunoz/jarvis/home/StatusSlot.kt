package com.carlosandmunoz.jarvis.home

/**
 * One ring or bar in the status notification card (#3610): metric, ring vs bar, optional label.
 * Saved as `kind:metric` or `kind:metric:Custom label`, comma-separated, in order.
 */
data class StatusSlot(val metric: String, val kind: Kind, val label: String? = null) {
    enum class Kind(val key: String) {
        RING("ring"), BAR("bar");
        companion object {
            fun of(key: String) = entries.find { it.key == key }
        }
    }

    /** Metrics the editor can place as a ring or a bar. */
    enum class Metric(val key: String, val title: String, val hint: String, val defaultKind: Kind) {
        READINESS("readiness", "Readiness", "Overall readiness percent", Kind.RING),
        UPTIME("uptime", "Uptime", "Pages answering right now", Kind.RING),
        CONNECTIONS("connections", "Connections", "How many systems are online", Kind.BAR),
        TARGETS("targets", "90-day targets", "The targets most in need of a push, as separate bars", Kind.BAR),
        GOALS("goals", "Goals", "Goals most in need of a push, as separate bars", Kind.BAR);

        companion object {
            fun of(key: String) = entries.find { it.key == key }
        }
    }

    fun encode(): String = buildString {
        append(kind.key).append(':').append(metric)
        val custom = label?.trim()?.takeIf { it.isNotEmpty() } ?: return@buildString
        append(':').append(custom.replace(',', ' ').replace(':', ' '))
    }

    companion object {
        const val KEY = "ongoing.slots"

        val DEFAULT = listOf(
            StatusSlot(Metric.READINESS.key, Kind.RING),
            StatusSlot(Metric.UPTIME.key, Kind.RING),
            StatusSlot(Metric.CONNECTIONS.key, Kind.BAR),
            StatusSlot(Metric.TARGETS.key, Kind.BAR),
            StatusSlot(Metric.GOALS.key, Kind.BAR),
        )

        fun parse(token: String): StatusSlot? {
            val parts = token.split(':', limit = 3)
            if (parts.size < 2) return null
            val kind = Kind.of(parts[0]) ?: return null
            val metric = parts[1].trim().ifEmpty { return null }
            val label = parts.getOrNull(2)?.trim()?.takeIf { it.isNotEmpty() }
            return StatusSlot(metric, kind, label)
        }

        fun decode(saved: String?): List<StatusSlot>? =
            saved?.split(',')?.mapNotNull { parse(it.trim()) }?.takeIf { it.isNotEmpty() }

        fun encode(slots: List<StatusSlot>) = slots.joinToString(",") { it.encode() }

        /**
         * Prefer the saved slot list; otherwise rebuild from the old category toggles
         * (`readiness` / `bar` in ongoing.parts) so upgrades keep the same card.
         */
        fun fromParts(savedSlots: String?, savedParts: String?): List<StatusSlot> {
            decode(savedSlots)?.let { return it }
            val keys = savedParts?.split(',')?.map { it.trim() }?.filter { it.isNotEmpty() }?.toSet()
            if (keys == null) return DEFAULT
            val out = mutableListOf<StatusSlot>()
            if ("readiness" in keys) {
                out += StatusSlot(Metric.READINESS.key, Kind.RING)
                out += StatusSlot(Metric.UPTIME.key, Kind.RING)
            }
            // Per-metric keys (#3610) or the old all-or-nothing `bar`.
            val barAll = "bar" in keys
            if (barAll || "connections" in keys) out += StatusSlot(Metric.CONNECTIONS.key, Kind.BAR)
            if (barAll || "targets" in keys) out += StatusSlot(Metric.TARGETS.key, Kind.BAR)
            if (barAll || "goals" in keys) out += StatusSlot(Metric.GOALS.key, Kind.BAR)
            return out
        }
    }
}
