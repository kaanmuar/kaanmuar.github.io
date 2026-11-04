package com.carlosandmunoz.jarvis

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts

/** Ask Jarvis bar (#1666): Post picks a photo or video first, then hands it to the share-to-post sheet as if shared from the gallery. */
class PickPostActivity : ComponentActivity() {
    private val pick = registerForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) startActivity(
            Intent(this, SharePostActivity::class.java).setAction(Intent.ACTION_SEND).setType(contentResolver.getType(uri))
                .putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        )
        finish()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (savedInstanceState == null) pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageAndVideo))
    }
}
