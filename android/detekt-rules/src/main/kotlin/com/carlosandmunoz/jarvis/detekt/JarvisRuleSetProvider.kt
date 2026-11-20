package com.carlosandmunoz.jarvis.detekt

import io.gitlab.arturbosch.detekt.api.Config
import io.gitlab.arturbosch.detekt.api.RuleSet
import io.gitlab.arturbosch.detekt.api.RuleSetProvider

class JarvisRuleSetProvider : RuleSetProvider {
    override val ruleSetId: String = "jarvis"
    override fun instance(config: Config): RuleSet = RuleSet(ruleSetId, listOf(UnstableSort(config)))
}
