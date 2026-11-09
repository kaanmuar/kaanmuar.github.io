package com.carlosandmunoz.jarvis.data

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.util.LruCache
import java.util.concurrent.TimeUnit
import okhttp3.OkHttpClient
import okhttp3.Request

/** Post proposals' card images (#2248), for the Social tab and the proposal push: fetched over https, scaled down and kept in memory. */
object CardImages {
    private const val MAX_BYTES = 8L * 1024 * 1024
    private val http by lazy { OkHttpClient.Builder().callTimeout(8, TimeUnit.SECONDS).build() }
    private val cache by lazy { object : LruCache<String, Bitmap>(12 * 1024 * 1024) { override fun sizeOf(key: String, value: Bitmap) = value.byteCount } }

    /** The url when the app loads it: https only, as the server sends it. */
    fun usable(url: String?): String? = url?.trim()?.takeIf { it.startsWith("https://") && it.length <= 1000 }

    /** The largest power-of-two step that keeps the decoded width at or above maxWidth. */
    fun sampleSize(width: Int, maxWidth: Int): Int {
        var step = 1
        while (maxWidth > 0 && width / (step * 2) >= maxWidth) step *= 2
        return step
    }

    data class Frame(val width: Int, val height: Int, val cardWidth: Int, val cardHeight: Int)

    /** A push's big picture shows about 2:1 and Android crops anything taller, so a tall card (the 4:5 round-up) goes whole
     * into a 2:1 frame frameHeight high. Null when the card is already wide enough to show as it is. */
    fun pushFrame(width: Int, height: Int, frameHeight: Int = 512): Frame? {
        if (width <= 0 || height <= 0 || width >= height * 1.7f) return null
        return Frame(frameHeight * 2, frameHeight, (width.toLong() * frameHeight / height).toInt(), frameHeight)
    }

    fun forPush(card: Bitmap): Bitmap {
        val f = pushFrame(card.width, card.height) ?: return card
        val out = Bitmap.createBitmap(f.width, f.height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(out)
        canvas.drawColor(0xFF0B1620.toInt())
        val left = (f.width - f.cardWidth) / 2f
        canvas.drawBitmap(card, null, RectF(left, 0f, left + f.cardWidth, f.height.toFloat()), Paint(Paint.FILTER_BITMAP_FLAG))
        return out
    }

    fun cached(url: String?): Bitmap? = usable(url)?.let { cache.get(it) }

    /** Blocking, so off the main thread: the image, or null when there is none, it is too big or not an image, or the fetch failed. */
    fun load(url: String?, maxWidth: Int = 1080): Bitmap? {
        val src = usable(url) ?: return null
        cache.get(src)?.let { return it }
        return runCatching {
            http.newCall(Request.Builder().url(src).build()).execute().use { res ->
                val body = res.body ?: return null
                if (!res.isSuccessful || body.contentLength() > MAX_BYTES) return null
                val source = body.source()
                if (source.request(MAX_BYTES + 1)) return null
                val bytes = source.buffer.readByteArray()
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
                if (bounds.outWidth <= 0) return null
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sampleSize(bounds.outWidth, maxWidth) })
            }
        }.getOrNull()?.also { cache.put(src, it) }
    }
}
