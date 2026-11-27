import SwiftUI

private enum Spearhead {
    static let background = Color(red: 0x0e / 255, green: 0x15 / 255, blue: 0x1c / 255)
    static let surface = Color(red: 0x14 / 255, green: 0x1d / 255, blue: 0x26 / 255)
    static let cyan = Color(red: 0x7e / 255, green: 0xf6 / 255, blue: 0xfb / 255)
    static let mint = Color(red: 0x5d / 255, green: 0xff / 255, blue: 0x9a / 255)
    static let text = Color(red: 0xe8 / 255, green: 0xf3 / 255, blue: 0xf4 / 255)
    static let muted = Color(red: 0x8e / 255, green: 0xa8 / 255, blue: 0xae / 255)
    static let sectionCard = Color(red: 0x0a / 255, green: 0x16 / 255, blue: 0x1b / 255).opacity(0.9)
    static let frostOverlay = Color(red: 0x0e / 255, green: 0x15 / 255, blue: 0x1c / 255).opacity(0.82)
}

private struct ReportSectionModel: Identifiable {
    let id: String
    let title: String
    let score: Int
    let state: String
    let teaser: String
    let body: String
}

struct ReportView: View {
    let draft: ReviewDraft
    let onDone: () -> Void

    private static let stubScore = 58
    private static let stubGrade = "D"
    private static let sections: [ReportSectionModel] = [
        ReportSectionModel(
            id: "seo",
            title: "SEO",
            score: 67,
            state: "At risk",
            teaser: "Titles and meta mostly in range; duplicate H1s on two routes.",
            body: "Canonical tags are present on the homepage but missing on /blog/archive. Open Graph images resolve but lack explicit width and height. Structured data validates with two non-critical warnings on product snippets."
        ),
        ReportSectionModel(
            id: "geo",
            title: "GEO",
            score: 61,
            state: "At risk",
            teaser: "AI-search snippets lack clear entity markup.",
            body: "FAQ and HowTo blocks are absent from key landing pages. Author and organization entities are weakly linked. Citation-ready summaries could be tightened for LLM crawlers."
        ),
        ReportSectionModel(
            id: "analytics",
            title: "Analytics",
            score: 72,
            state: "Passes",
            teaser: "Primary tag fires; consent mode needs a second look.",
            body: "GA4 loads after consent on EU traffic. Event naming is consistent but purchase funnel has a duplicate page_view. Server-side mirror is not configured."
        ),
        ReportSectionModel(
            id: "security",
            title: "Security",
            score: 47,
            state: "Fails now",
            teaser: "HSTS missing; DMARC policy could be stricter.",
            body: "Content-Security-Policy is report-only. TLS 1.2 still advertised on a legacy subdomain. DMARC is p=none with sparse aggregate reporting."
        ),
        ReportSectionModel(
            id: "a11y",
            title: "Accessibility",
            score: 58,
            state: "At risk",
            teaser: "Contrast and focus order issues on checkout.",
            body: "Three buttons fail 4.5:1 contrast on mobile. Modal traps focus but returns focus inconsistently on close. Landmarks omit a main region on the pricing page."
        ),
        ReportSectionModel(
            id: "perf",
            title: "Performance",
            score: 54,
            state: "At risk",
            teaser: "LCP borderline on mobile; images lack dimensions.",
            body: "Largest Contentful Paint sits at 2.6s on 4G throttling. Hero WebP is oversized; lazy loading skips below-fold galleries. Third-party chat widget blocks main thread during hydration."
        ),
    ]

    @State private var expandedIds: Set<String> = []

    @State private var showUnlockSheet = false
    @State private var unlockContext = "sticky"

    var body: some View {
        ZStack {
            Spearhead.background.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if !displayHost.isEmpty {
                        Text(displayHost)
                            .font(.caption)
                            .foregroundStyle(Spearhead.muted)
                            .lineLimit(2)
                    }

                    scoreHero

                    foldAllRow

                    ForEach(Self.sections) { section in
                        sectionCard(section)
                    }

                    Text("Soft preview on device — live payload in a later wave.")
                        .font(.footnote)
                        .foregroundStyle(Spearhead.muted)
                        .padding(.top, 4)

                    Color.clear.frame(height: 120)
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
            }
        }
        .navigationTitle("Report")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Spearhead.background, for: .navigationBar)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Done", action: onDone)
                    .foregroundStyle(Spearhead.cyan)
            }
        }
        .safeAreaInset(edge: .bottom) {
            stickyUnlockBar
        }
        .sheet(isPresented: $showUnlockSheet) {
            unlockSheet
                .presentationDetents([.medium])
                .presentationDragIndicator(.visible)
        }
    }

    private var displayHost: String {
        draft.normalizedURL?.host ?? draft.inputURL
    }

    private var scoreHero: some View {
        HStack(spacing: 20) {
            ZStack {
                Circle()
                    .fill(Spearhead.background)
                    .frame(width: 88, height: 88)
                Text("\(Self.stubScore)")
                    .font(.system(size: 36, weight: .bold, design: .rounded))
                    .foregroundStyle(Spearhead.cyan)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text("Overall score")
                    .font(.caption)
                    .foregroundStyle(Spearhead.muted)
                Text("Grade \(Self.stubGrade)")
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(Spearhead.text)
                Text("Soft preview · scores and teasers only until unlock.")
                    .font(.caption)
                    .foregroundStyle(Spearhead.muted)
            }
            Spacer(minLength: 0)
        }
        .padding(20)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Spearhead.surface)
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .strokeBorder(Spearhead.cyan.opacity(0.16), lineWidth: 1)
                )
        )
    }

    private var foldAllRow: some View {
        HStack {
            Spacer()
            Button("Expand all") {
                expandedIds = Set(Self.sections.map(\.id))
            }
            .font(.subheadline.weight(.medium))
            .foregroundStyle(Spearhead.cyan)
            Button("Collapse all") {
                expandedIds.removeAll()
            }
            .font(.subheadline.weight(.medium))
            .foregroundStyle(Spearhead.cyan)
        }
    }

    private func sectionCard(_ section: ReportSectionModel) -> some View {
        let expanded = expandedIds.contains(section.id)

        return VStack(alignment: .leading, spacing: 0) {
            Button {
                if expanded {
                    expandedIds.remove(section.id)
                } else {
                    expandedIds.insert(section.id)
                }
            } label: {
                HStack(alignment: .top, spacing: 10) {
                    Text("\(section.score)")
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(Spearhead.cyan)
                        .frame(minWidth: 28)
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 8) {
                            Text(section.title)
                                .font(.body.weight(.medium))
                                .foregroundStyle(Spearhead.text)
                            Text(section.state)
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(Spearhead.mint)
                        }
                        Text(expanded ? "Tap to collapse" : section.teaser)
                            .font(.caption)
                            .foregroundStyle(Spearhead.muted)
                            .lineLimit(expanded ? 1 : 2)
                            .multilineTextAlignment(.leading)
                    }
                    Spacer(minLength: 8)
                    Image(systemName: expanded ? "chevron.up" : "chevron.down")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Spearhead.muted)
                }
                .padding(14)
            }
            .buttonStyle(.plain)

            if expanded {
                Divider().overlay(Spearhead.cyan.opacity(0.12))
                frostedBody(section.body)
            }
        }
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(Spearhead.sectionCard)
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .strokeBorder(Spearhead.cyan.opacity(0.12), lineWidth: 1)
                )
        )
    }

    private func frostedBody(_ text: String) -> some View {
        ZStack {
            Text(text)
                .font(.subheadline)
                .foregroundStyle(Spearhead.text)
                .blur(radius: 6)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(14)
            Spearhead.frostOverlay
            Text("Unlock $5 fix list to read findings")
                .font(.caption.weight(.semibold))
                .foregroundStyle(Spearhead.cyan)
                .padding()
        }
        .frame(minHeight: 88)
    }

    private var stickyUnlockBar: some View {
        VStack(spacing: 0) {
            Divider().overlay(Spearhead.cyan.opacity(0.12))
            HStack {
                ForEach([("Print", "print"), ("Share", "share"), ("Export", "export")], id: \.1) { label, kind in
                    Button(label) {
                        unlockContext = kind
                        showUnlockSheet = true
                    }
                    .font(.subheadline)
                    .foregroundStyle(Spearhead.muted)
                    .frame(maxWidth: .infinity)
                }
            }
            .padding(.horizontal, 8)
            .padding(.top, 6)

            Button {
                unlockContext = "sticky"
                showUnlockSheet = true
            } label: {
                VStack(spacing: 2) {
                    Text("Unlock fix list — $5 USD")
                        .font(.subheadline.weight(.semibold))
                    Text("One-time · full findings, PDF, share, print")
                        .font(.caption2)
                        .opacity(0.85)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
            }
            .buttonStyle(.borderedProminent)
            .tint(Spearhead.cyan)
            .foregroundStyle(Color(red: 0x04 / 255, green: 0x10 / 255, blue: 0x14 / 255))
            .padding(.horizontal, 16)
            .padding(.bottom, 8)
        }
        .background(Spearhead.surface)
    }

    private var unlockSheet: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                Text("Unlock fix list")
                    .font(.title2.weight(.semibold))
                Text(
                    "$5 USD once on this report. Every finding, top ten fixes, and a PDF. Cases stay blurred until full report unlock."
                )
                .font(.body)
                .foregroundStyle(.secondary)
                if unlockContext != "sticky" {
                    Text("Opened from \(unlockContext.capitalized) — checkout ships in a later wave.")
                        .font(.footnote)
                        .foregroundStyle(.tertiary)
                }
                Button("Continue") {
                    showUnlockSheet = false
                }
                .buttonStyle(.borderedProminent)
                .tint(Spearhead.cyan)
                Spacer()
            }
            .padding(24)
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

#Preview {
    NavigationStack {
        ReportView(
            draft: ReviewDraft(inputURL: "https://example.com", normalizedURL: URL(string: "https://example.com")),
            onDone: {}
        )
    }
}