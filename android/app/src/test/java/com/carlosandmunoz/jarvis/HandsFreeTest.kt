package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.voice.HandsFree
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HandsFreeTest {
    @Test fun stopWordsEndHandsFree() {
        listOf("stop", "Stop.", "  STOP listening ", "Goodbye, Jarvis!", "para", "Deja de escuchar", "Adiós Jarvis", "that's all").forEach {
            assertTrue(it, HandsFree.isStop(it))
        }
    }

    @Test fun questionsWithStopInThemAreAsked() {
        listOf("why did the pipeline stop", "stop the sweep job and tell me why", "para qué sirve el informe", "What needs me today?").forEach {
            assertFalse(it, HandsFree.isStop(it))
        }
    }
}
