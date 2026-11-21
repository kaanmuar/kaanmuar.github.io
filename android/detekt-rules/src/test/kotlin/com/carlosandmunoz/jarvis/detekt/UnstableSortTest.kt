package com.carlosandmunoz.jarvis.detekt

import io.gitlab.arturbosch.detekt.test.lint
import org.junit.Assert.assertEquals
import org.junit.Test

class UnstableSortTest {
    private fun count(code: String) = UnstableSort().lint(code.trimIndent()).size

    @Test fun flagsSortedByLastModified() = assertEquals(1, count("""
        import java.io.File
        fun trim(files: List<File>) = files.sortedBy { it.lastModified() }
    """))

    @Test fun flagsSortedByDescendingAndInPlaceSorts() = assertEquals(2, count("""
        import java.io.File
        fun a(files: List<File>) = files.sortedByDescending { f -> f.lastModified() }
        fun b(files: MutableList<File>) = files.sortBy { it.lastModified() }
    """))

    @Test fun flagsComparatorAndCallableReference() = assertEquals(3, count("""
        import java.io.File
        fun a(files: List<File>) = files.sortedWith(compareBy { it.lastModified() })
        fun b(files: List<File>) = files.sortedWith(compareByDescending<File> { it.lastModified() }.thenBy { it.name })
        fun c(files: List<File>) = files.sortedBy(File::lastModified)
    """))

    @Test fun allowsSnapshotThenSort() = assertEquals(0, count("""
        import java.io.File
        fun trim(files: List<File>) =
            files.map { it to it.lastModified() }.sortedBy { it.second }.map { it.first }
    """))

    @Test fun allowsOtherSortsAndPlainReads() = assertEquals(0, count("""
        import java.io.File
        fun a(names: List<String>) = names.sortedBy { it.length }
        fun b(files: List<File>) = files.sortedBy { it.name }
        fun c(file: File) = file.lastModified()
    """))
}
