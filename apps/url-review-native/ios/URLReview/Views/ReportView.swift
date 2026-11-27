import SwiftUI

/// StatusCard glass report + gold Unlock — web spearhead / #4503 parity (#4513).
private enum ReportTokens {
    static let background = Color(red: 0x0e / 255, green: 0x15 / 255, blue: 0x1c / 255)
    static let surface = Color(red: 0x0a / 255, green: 0x16 / 255, blue: 0x1b / 255).opacity(0.72)
    static let cyan = Color(red: 0x7e / 255, green: 0xf6 / 255, blue: 0xfb / 255)
    static let mint = Color(red: 0x5d / 255, green: 0xff / 255, blue: 0x9a / 255)
    static let gold = Color(red: 0xf0 / 255, green: 0xc8 / 255, blue: 0x5a / 255)
    static let coral = Color(red: 0xff / 255, green: 0x5a / 255, blue: 0x4a / 255)
    static let text = Color(red: 0xe8 / 255, green: 0xf3 / 255, blue: 0xf4 / 255)
    static let muted = Color(red: 0x8e / 255, green: 0xa8 / 255, blue: 0xae / 255)
    static let line = Color(red: 0x7e / 255, green: 0xd6 / 255, blue: 0xe0 / 255).opacity(0.28)
    static let onGold = Color(red: 0x04 / 255, green: 0x10 / 255, blue: 0x14 / 255)
}

private struct StatusBar: Identifiable {
    let id: String
    let label: String
    let value: String
    let pct: Double
    let color: Color
}

private struct StatusCardModel: Identifiable {
    let id: String
    let title: String
    let lockCount: Int
    let ringA: (label: String, pct: Double, color: Color)
    let ringB: (label: String, pct: Double, color: Color)
    let bars: [StatusBar]
    let footerLines: [String]
}

struct ReportView: View {
    let draft: ReviewDraft
    let onDone: () -> Void

    private static let cards: [StatusCardModel] = [
        StatusCardModel(
            id: "trust",
            title: "Trust & headers",
            lockCount: 5,
            ringA: ("42", 0.42, ReportTokens.coral),
            ringB: ("70", 0.70, ReportTokens.gold),
            bars: [
                StatusBar(id: "f", label: "Fails", value: "5", pct: 0.80, color: ReportTokens.coral),
                StatusBar(id: "r", label: "Risks", value: "2", pct: 0.40, color: ReportTokens.gold),
                StatusBar(id: "p", label: "Pass", value: "6", pct: 0.55, color: ReportTokens.mint),
            ],
            footerLines: [
                "HSTS missing on apex — browsers skip preload.",
                "CSP is report-only; XSS still lands.",
                "3 cookies lack Secure + SameSite=None.",
            ],
        ),
        StatusCardModel(
            id: "vitals",
            title: "Core vitals & bloat",
            lockCount: 4,
            ringA: ("58", 0.58, ReportTokens.coral),
            ringB: ("45", 0.45, ReportTokens.gold),
            bars: [
                StatusBar(id: "lcp", label: "LCP", value: "4.8s", pct: 0.25, color: ReportTokens.coral),
                StatusBar(id: "w", label: "Weight", value: "2.1MB", pct: 0.62, color: ReportTokens.gold),
                StatusBar(id: "cls", label: "CLS", value: "0.18", pct: 0.40, color: ReportTokens.gold),
            ],
            footerLines: [
                "LCP 4.8s — unsized hero <img>.",
                "2 render-blocking CSS in <head>.",
                "CLS 0.18 on promo carousel.",
            ],
        ),
        StatusCardModel(
            id: "find",
            title: "Findability",
            lockCount: 3,
            ringA: ("61", 0.61, ReportTokens.gold),
            ringB: ("80", 0.80, ReportTokens.mint),
            bars: [
                StatusBar(id: "seo", label: "SEO", value: "61", pct: 0.61, color: ReportTokens.gold),
                StatusBar(id: "sch", label: "Schema", value: "ok", pct: 0.80, color: ReportTokens.mint),
                StatusBar(id: "soc", label: "Social", value: "gap", pct: 0.35, color: ReportTokens.coral),
            ],
            footerLines: [
                "Canonical self-ref ok.",
                "Missing OG image on PDP.",
                "2 thin title tags under 20 chars.",
            ],
        ),
        StatusCardModel(
            id: "cases",
            title: "Cases to run",
            lockCount: 12,
            ringA: ("12", 1.0, ReportTokens.mint),
            ringB: ("P0", 0.33, ReportTokens.coral),
            bars: [
                StatusBar(id: "p0", label: "P0", value: "3", pct: 0.90, color: ReportTokens.coral),
                StatusBar(id: "p1", label: "P1", value: "5", pct: 0.60, color: ReportTokens.gold),
                StatusBar(id: "p2", label: "P2", value: "4", pct: 0.40, color: ReportTokens.cyan),
            ],
            footerLines: [
                "P0: checkout · pay · confirm.",
                "P1: mobile nav + search.",
                "P2: a11y name missing on primary CTA.",
            ],
        ),
    ]

    @State private var expandedIds: Set<String> = []
    @State private var showUnlockSheet = false

    private var hostLabel: String {
        if let host = draft.normalizedURL?.host, !host.isEmpty { return host }
        let trimmed = draft.inputURL.trimmingCharacters(in: .whitespacesAndNewlines)
        let bare = trimmed.replacingOccurrences(of: #"^https?://"#, with: "", options: .regularExpression)
        return bare.split(separator: "/").first.map(String.init) ?? "example.com"
    }

    var body: some View {
        ZStack {
            ReportTokens.background.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    header
                    primeSuspect
                    ForEach(Self.cards) { card in
                        StatusCardRow(
                            card: card,
                            expanded: expandedIds.contains(card.id),
                            onToggle: { toggle(card.id) },
                        )
                    }
                    Spacer(minLength: 140)
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
            }
        }
        .navigationTitle("Report")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Done", action: onDone)
                    .foregroundStyle(ReportTokens.cyan)
            }
        }
        .safeAreaInset(edge: .bottom) {
            stickyBar
        }
        .sheet(isPresented: $showUnlockSheet) {
            unlockSheet
                .presentationDetents([.medium])
                .presentationDragIndicator(.visible)
                .preferredColorScheme(.dark)
        }
        .preferredColorScheme(.dark)
    }

    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 4) {
                Text(hostLabel)
                    .font(.system(size: 18, weight: .semibold, design: .serif))
                    .foregroundStyle(ReportTokens.text)
                Text("Soft preview · StatusCard rows")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(ReportTokens.muted)
            }
            Spacer()
            Button(expandedIds.count == Self.cards.count ? "Collapse all" : "Expand all") {
                if expandedIds.count == Self.cards.count {
                    expandedIds.removeAll()
                } else {
                    expandedIds = Set(Self.cards.map(\.id))
                }
            }
            .font(.system(size: 11, weight: .semibold))
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .foregroundStyle(ReportTokens.text)
            .background(ReportTokens.surface, in: Capsule())
            .overlay(Capsule().strokeBorder(ReportTokens.line))
        }
    }

    private var primeSuspect: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Prime suspect · clear")
                .font(.system(size: 10, weight: .bold))
                .tracking(1.4)
                .textCase(.uppercase)
                .foregroundStyle(ReportTokens.coral)
            Text("LCP waits 4.8s on the hero image")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(ReportTokens.text)
            Text("Same frosted-report rule: top finding stays readable so scores are not invented.")
                .font(.system(size: 12))
                .foregroundStyle(ReportTokens.muted)
                .lineLimit(2)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ReportTokens.coral.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .strokeBorder(ReportTokens.coral.opacity(0.35)),
        )
    }

    private var stickyBar: some View {
        VStack(spacing: 8) {
            HStack(spacing: 6) {
                ForEach(["Print", "Share", "Export"], id: \.self) { label in
                    Button(label) { showUnlockSheet = true }
                        .font(.system(size: 11, weight: .semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .foregroundStyle(ReportTokens.muted)
                        .background(ReportTokens.surface, in: RoundedRectangle(cornerRadius: 9))
                        .overlay(RoundedRectangle(cornerRadius: 9).strokeBorder(ReportTokens.line))
                        .opacity(0.7)
                }
            }
            Button { showUnlockSheet = true } label: {
                VStack(spacing: 4) {
                    Text("Unlock full lab report — $5")
                        .font(.system(size: 14, weight: .bold))
                    Text("One-time · full findings, PDF, share, print")
                        .font(.system(size: 10, weight: .medium))
                        .opacity(0.8)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .foregroundStyle(ReportTokens.onGold)
                .background(
                    LinearGradient(
                        colors: [ReportTokens.gold, Color(red: 0xf2 / 255, green: 0xc9 / 255, blue: 0x4c / 255)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing,
                    ),
                    in: RoundedRectangle(cornerRadius: 12),
                )
            }
            .buttonStyle(.plain)
        }
        .padding(12)
        .background(.ultraThinMaterial)
        .overlay(Rectangle().fill(ReportTokens.line).frame(height: 1), alignment: .top)
    }

    private var unlockSheet: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Unseal all lab notes")
                .font(.system(size: 24, weight: .regular, design: .serif))
                .foregroundStyle(ReportTokens.text)
            Text("Pay once for this report. Full findings, PDF, share, print — StoreKit / Play Billing lands with #40.")
                .font(.system(size: 13))
                .foregroundStyle(ReportTokens.muted)
            HStack {
                Text("This report unlock")
                    .foregroundStyle(ReportTokens.muted)
                Spacer()
                Text("$5")
                    .font(.system(size: 32, weight: .regular, design: .serif))
                    .foregroundStyle(ReportTokens.gold)
            }
            .padding(12)
            .background(ReportTokens.gold.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .strokeBorder(ReportTokens.gold.opacity(0.35)),
            )
            Text("EMAIL THE UNLOCKED LINK")
                .font(.system(size: 10, weight: .bold))
                .tracking(1.2)
                .foregroundStyle(ReportTokens.muted)
            Text("you@company.com")
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
                .foregroundStyle(ReportTokens.muted)
                .background(ReportTokens.surface, in: RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(ReportTokens.line))
            Button {
                showUnlockSheet = false
            } label: {
                Text("Pay $5 · Apple Pay")
                    .font(.system(size: 15, weight: .bold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .foregroundStyle(ReportTokens.onGold)
                    .background(
                        LinearGradient(
                            colors: [ReportTokens.cyan, ReportTokens.mint],
                            startPoint: .leading,
                            endPoint: .trailing,
                        ),
                        in: RoundedRectangle(cornerRadius: 12),
                    )
            }
            .buttonStyle(.plain)
            Button("Maybe later · keep soft preview") {
                showUnlockSheet = false
            }
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(ReportTokens.muted)
            .frame(maxWidth: .infinity)
            Spacer()
        }
        .padding(20)
        .background(ReportTokens.background)
    }

    private func toggle(_ id: String) {
        if expandedIds.contains(id) {
            expandedIds.remove(id)
        } else {
            expandedIds.insert(id)
        }
    }
}

private struct StatusCardRow: View {
    let card: StatusCardModel
    let expanded: Bool
    let onToggle: () -> Void

    var body: some View {
        Button(action: onToggle) {
            VStack(alignment: .leading, spacing: 8) {
                Text("\(card.title) · 🔒 \(card.lockCount)")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(ReportTokens.text)

                HStack(alignment: .center, spacing: 10) {
                    HStack(spacing: 8) {
                        ScoreRing(label: card.ringA.label, pct: card.ringA.pct, color: card.ringA.color, large: expanded)
                        ScoreRing(label: card.ringB.label, pct: card.ringB.pct, color: card.ringB.color, large: expanded)
                    }
                    VStack(spacing: 6) {
                        ForEach(expanded ? card.bars : Array(card.bars.prefix(2))) { bar in
                            MetricBar(bar: bar, thick: expanded)
                        }
                    }
                }

                if expanded {
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(card.footerLines, id: \.self) { line in
                            Text("· \(line)")
                                .font(.system(size: 12))
                                .foregroundStyle(ReportTokens.muted)
                                .blur(radius: 4)
                        }
                    }
                    .padding(.top, 4)
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(ReportTokens.surface, in: RoundedRectangle(cornerRadius: 14))
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .strokeBorder(ReportTokens.line),
            )
            .overlay {
                RoundedRectangle(cornerRadius: 14)
                    .fill(ReportTokens.background.opacity(0.25))
                    .allowsHitTesting(false)
            }
        }
        .buttonStyle(.plain)
    }
}

private struct ScoreRing: View {
    let label: String
    let pct: Double
    let color: Color
    var large = false

    var body: some View {
        let size: CGFloat = large ? 56 : 44
        ZStack {
            Circle()
                .stroke(Color.white.opacity(0.12), lineWidth: large ? 5 : 4)
            Circle()
                .trim(from: 0, to: pct)
                .stroke(color, style: StrokeStyle(lineWidth: large ? 5 : 4, lineCap: .round))
                .rotationEffect(.degrees(-90))
            Text(label)
                .font(.system(size: large ? 13 : 11, weight: .bold))
                .foregroundStyle(ReportTokens.text)
        }
        .frame(width: size, height: size)
    }
}

private struct MetricBar: View {
    let bar: StatusBar
    var thick = false

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(bar.label)
                    .font(.system(size: 11))
                    .foregroundStyle(ReportTokens.text)
                Spacer()
                Text(bar.value)
                    .font(.system(size: 11))
                    .foregroundStyle(ReportTokens.muted)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.white.opacity(0.08))
                    Capsule()
                        .fill(bar.color)
                        .frame(width: max(4, geo.size.width * bar.pct))
                }
            }
            .frame(height: thick ? 6 : 3)
        }
    }
}

#Preview {
    NavigationStack {
        ReportView(
            draft: ReviewDraft(inputURL: "https://example-shop.com", normalizedURL: URL(string: "https://example-shop.com")),
            onDone: {},
        )
    }
}
