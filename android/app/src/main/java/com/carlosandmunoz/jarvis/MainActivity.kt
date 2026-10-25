package com.carlosandmunoz.jarvis

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.LaunchedEffect
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_WEAK
import androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import androidx.biometric.BiometricPrompt
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.carlosandmunoz.jarvis.ui.Backdrop
import com.carlosandmunoz.jarvis.ui.JarvisTheme
import com.carlosandmunoz.jarvis.ui.LockScreen
import com.carlosandmunoz.jarvis.ui.MainScreen
import com.carlosandmunoz.jarvis.ui.SignInScreen
import com.carlosandmunoz.jarvis.push.Push

class MainActivity : FragmentActivity() {
    private val vm: JarvisViewModel by viewModels()
    private val vault get() = (application as JarvisApp).vault
    private var locked by mutableStateOf(false)
    private var lockOn by mutableStateOf(true)
    private var openTab by mutableStateOf<String?>(null)
    private val askNotifications = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge(SystemBarStyle.dark(Color.TRANSPARENT), SystemBarStyle.dark(Color.TRANSPARENT))
        lockOn = vault.flag("lock", true) && canLock()
        openTab = intent.getStringExtra(Push.EXTRA_TAB)
        setContent {
            JarvisTheme {
                Backdrop {
                    val s by vm.state.collectAsStateWithLifecycle()
                    LaunchedEffect(s.signedIn) { if (s.signedIn) askForNotifications() }
                    when {
                        !s.signedIn -> SignInScreen(s, vm)
                        locked -> LockScreen(::prompt)
                        else -> MainScreen(s, vm, lockOn, openTab, { openTab = null }) { on -> lockOn = on && canLock(); vault.setFlag("lock", lockOn) }
                    }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.getStringExtra(Push.EXTRA_TAB)?.let { openTab = it }
    }

    /** Android 13+ asks once; afterwards the switch lives in Android's app settings, linked from Settings. */
    private fun askForNotifications() {
        if (Build.VERSION.SDK_INT < 33 || vault.flag("push.asked", false)) return
        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return
        vault.setFlag("push.asked", true)
        askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
    }

    override fun onStart() {
        super.onStart()
        if (lockOn && vm.state.value.signedIn && System.currentTimeMillis() - leftAt > LOCK_AFTER_MS) {
            locked = true
            prompt()
        }
    }

    override fun onStop() {
        super.onStop()
        if (!isChangingConfigurations && !locked) leftAt = System.currentTimeMillis()
    }

    private fun canLock() = BiometricManager.from(this).canAuthenticate(BIOMETRIC_WEAK or DEVICE_CREDENTIAL) == BiometricManager.BIOMETRIC_SUCCESS

    private fun prompt() {
        val info = BiometricPrompt.PromptInfo.Builder().setTitle("Unlock Jarvis").setAllowedAuthenticators(BIOMETRIC_WEAK or DEVICE_CREDENTIAL).build()
        BiometricPrompt(this, ContextCompat.getMainExecutor(this), object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                locked = false
                leftAt = System.currentTimeMillis()
            }
        }).authenticate(info)
    }

    companion object {
        private const val LOCK_AFTER_MS = 60_000L
        private var leftAt = 0L
    }
}
