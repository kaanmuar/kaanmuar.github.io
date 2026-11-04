package com.carlosandmunoz.jarvis.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import okhttp3.FormBody
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody

/**
 * Firebase Auth over its REST API, as the owner account admin.html uses: password, then the TOTP code.
 * The jarvis function accepts only tokens whose sign-in provider is password or emailLink.
 */
class Auth(private val http: OkHttpClient, private val vault: Vault) {
    sealed interface Step {
        data object Done : Step
        data class NeedsCode(val pending: String, val enrollmentId: String, val factor: String) : Step
    }

    class AuthError(message: String) : Exception(message)

    private val lock = Mutex()
    @Volatile private var idToken: String? = null
    @Volatile private var expiresAt = 0L

    val email: String? get() = vault.get("email")
    val signedIn: Boolean get() = vault.get("refresh") != null

    suspend fun signIn(email: String, password: String): Step {
        val out = post("$IDT/v1/accounts:signInWithPassword?key=$KEY", buildJsonObject {
            put("email", email); put("password", password); put("returnSecureToken", true)
        }.toString().toRequestBody(JSON_TYPE))
        val pending = out.str("mfaPendingCredential")
        if (pending != null) {
            val factor = out.objs("mfaInfo").firstOrNull { it["totpInfo"] != null } ?: out.objs("mfaInfo").firstOrNull()
                ?: throw AuthError("Two-step sign-in is on, but no second factor was returned.")
            if (factor["totpInfo"] == null) throw AuthError("Only the authenticator-app second factor works in the app.")
            vault.put("email", email)
            return Step.NeedsCode(pending, factor.str("mfaEnrollmentId") ?: "", factor.str("displayName") ?: "Authenticator")
        }
        keep(email, out.str("idToken"), out.str("refreshToken"), out.str("expiresIn"))
        return Step.Done
    }

    suspend fun finishWithCode(step: Step.NeedsCode, code: String) {
        val out = post("$IDT/v2/accounts/mfaSignIn:finalize?key=$KEY", buildJsonObject {
            put("mfaPendingCredential", step.pending)
            put("mfaEnrollmentId", step.enrollmentId)
            putJsonObject("totpVerificationInfo") { put("verificationCode", code.trim()) }
        }.toString().toRequestBody(JSON_TYPE))
        keep(email ?: "", out.str("idToken"), out.str("refreshToken"), null)
    }

    /** A fresh ID token, refreshed a minute before it runs out. */
    suspend fun token(force: Boolean = false): String = lock.withLock {
        val now = System.currentTimeMillis()
        idToken?.let { if (!force && now < expiresAt - 60_000) return it }
        val refresh = vault.get("refresh") ?: throw AuthError("Sign in first.")
        val out = try {
            post("$STS/v1/token?key=$KEY", FormBody.Builder().add("grant_type", "refresh_token").add("refresh_token", refresh).build())
        } catch (e: AuthError) {
            signOut()
            throw e
        }
        val token = out.str("id_token") ?: throw AuthError("Sign in again.")
        out.str("refresh_token")?.let { vault.put("refresh", it) }
        idToken = token
        expiresAt = now + (out.str("expires_in")?.toLongOrNull() ?: 3600) * 1000
        token
    }

    fun signOut() {
        idToken = null
        vault.put("refresh", null)
    }

    private fun keep(email: String, id: String?, refresh: String?, expiresIn: String?) {
        if (id == null || refresh == null) throw AuthError("Sign-in did not return a token.")
        vault.put("email", email)
        vault.put("refresh", refresh)
        idToken = id
        expiresAt = System.currentTimeMillis() + (expiresIn?.toLongOrNull() ?: 3600) * 1000
    }

    private suspend fun post(url: String, body: RequestBody): JsonObject = withContext(Dispatchers.IO) {
        http.newCall(Request.Builder().url(url).post(body).build()).execute().use { res ->
            val json = runCatching { JSON.parseToJsonElement(res.body?.string() ?: "{}") as JsonObject }.getOrNull() ?: JsonObject(emptyMap())
            if (!res.isSuccessful) throw AuthError(friendly(json.obj("error").str("message") ?: "HTTP ${res.code}"))
            json
        }
    }

    private fun friendly(code: String) = when {
        code.startsWith("INVALID_LOGIN_CREDENTIALS") || code.startsWith("INVALID_PASSWORD") || code.startsWith("EMAIL_NOT_FOUND") -> "Wrong email or password."
        code.startsWith("INVALID_MFA_PENDING_CREDENTIAL") -> "The sign-in took too long. Start again."
        code.startsWith("INVALID_TOTP") || code.contains("VERIFICATION_CODE") -> "That code is wrong or expired."
        code.startsWith("TOO_MANY_ATTEMPTS") -> "Too many tries. Wait a few minutes."
        code.startsWith("TOKEN_EXPIRED") || code.startsWith("USER_DISABLED") || code.startsWith("INVALID_REFRESH_TOKEN") -> "Sign in again."
        else -> code
    }

    companion object {
        const val KEY = "AIzaSyA2-6WkecV3GoAK4qlsdGtH3jisjk3bK0w"
        private const val IDT = "https://identitytoolkit.googleapis.com"
        private const val STS = "https://securetoken.googleapis.com"
        val JSON_TYPE = "application/json".toMediaType()
    }
}
