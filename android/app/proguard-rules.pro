-dontwarn okhttp3.internal.platform.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**

# Glance finds a widget's home-screen IDs by its class name, so the widgets must keep distinct names.
-keep class * extends androidx.glance.appwidget.GlanceAppWidget
