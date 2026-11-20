package com.carlosandmunoz.jarvis.detekt

import io.gitlab.arturbosch.detekt.api.CodeSmell
import io.gitlab.arturbosch.detekt.api.Config
import io.gitlab.arturbosch.detekt.api.Debt
import io.gitlab.arturbosch.detekt.api.Entity
import io.gitlab.arturbosch.detekt.api.Issue
import io.gitlab.arturbosch.detekt.api.Rule
import io.gitlab.arturbosch.detekt.api.Severity
import org.jetbrains.kotlin.psi.KtCallExpression
import org.jetbrains.kotlin.psi.KtCallableReferenceExpression
import org.jetbrains.kotlin.psi.KtNameReferenceExpression
import org.jetbrains.kotlin.psi.psiUtil.collectDescendantsOfType

/**
 * Flags a sort whose key is read from a value that can change while the sort runs, such as
 * `File.lastModified()`. TimSort throws "Comparison method violates its general contract" when
 * another writer touches a file mid-sort (CursorQuota DiskCache.trim, #3783).
 *
 * Fix: read each timestamp once, then sort the snapshot:
 * `files.map { it to it.lastModified() }.sortedBy { it.second }.map { it.first }`.
 *
 * Syntactic only (no type resolution): any `lastModified()` call or `::lastModified` reference
 * inside the arguments of a sort call is reported.
 */
class UnstableSort(config: Config = Config.empty) : Rule(config) {
    override val issue = Issue(
        id = "UnstableSort",
        severity = Severity.Defect,
        description = "Sort key reads a mutable value (File.lastModified()) during the sort; " +
            "TimSort can throw IllegalArgumentException. Read each timestamp once before sorting.",
        debt = Debt.FIVE_MINS,
    )

    override fun visitCallExpression(expression: KtCallExpression) {
        super.visitCallExpression(expression)
        val name = expression.calleeExpression?.text ?: return
        if (name !in SORT_CALLS || !readsMutableKey(expression)) return
        report(
            CodeSmell(
                issue,
                Entity.from(expression),
                "`$name` reads File.lastModified() inside the comparison. Capture the timestamps first " +
                    "(map { it to it.lastModified() }) and sort the snapshot (#3783).",
            ),
        )
    }

    private fun readsMutableKey(sort: KtCallExpression): Boolean {
        val args = sort.valueArguments + sort.lambdaArguments
        return args.any { arg ->
            val node = arg.getArgumentExpression() ?: return@any false
            val calls = node.collectDescendantsOfType<KtCallExpression>().toMutableList()
            (node as? KtCallExpression)?.let(calls::add)
            val refs = node.collectDescendantsOfType<KtCallableReferenceExpression>().toMutableList()
            (node as? KtCallableReferenceExpression)?.let(refs::add)
            calls.any { it.calleeExpression?.text in MUTABLE_KEYS } ||
                refs.any { (it.callableReference as? KtNameReferenceExpression)?.getReferencedName() in MUTABLE_KEYS }
        }
    }

    private companion object {
        val SORT_CALLS = setOf(
            "sortedBy", "sortedByDescending", "sortBy", "sortByDescending",
            "sortedWith", "sortWith", "sorted", "sort",
        )
        val MUTABLE_KEYS = setOf("lastModified")
    }
}
