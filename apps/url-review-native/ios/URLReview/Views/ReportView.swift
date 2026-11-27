import SwiftUI

struct ReportView: View {
    let draft: ReviewDraft
    let onDone: () -> Void

    private static let stubScore = 72
    private static let stubRows: [(title: String, detail: String)] = [
        ("SEO", "Meta and structure — stub"),
        ("Performance", "Core Web Vitals — stub"),
        ("Security", "Headers and TLS — stub"),
        ("Accessibility", "Contrast and landmarks — stub"),
        ("Analytics", "Tags and consent — stub"),
        ("GEO", "AI-search readiness — stub")
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                scoreHero

                VStack(alignment: .leading, spacing: 12) {
                    Text("Findings")
                        .font(.headline)

                    ForEach(Self.stubRows, id: \.title) { row in
                        DisclosureGroup {
                            Text(row.detail)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .padding(.top, 4)
                        } label: {
                            HStack {
                                Text(row.title)
                                    .font(.body.weight(.medium))
                                Spacer()
                                Text("—")
                                    .foregroundStyle(.tertiary)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }

                Text("Report placeholder for \(displayHost). Scores sync with carlosandmunoz.com in a later wave.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .padding()
        }
        .navigationTitle("Report")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Done", action: onDone)
            }
        }
    }

    private var displayHost: String {
        draft.normalizedURL?.host ?? draft.inputURL
    }

    private var scoreHero: some View {
        VStack(spacing: 8) {
            Text("\(Self.stubScore)")
                .font(.system(size: 64, weight: .bold, design: .rounded))
                .foregroundStyle(.primary)
            Text("Overall score (stub)")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Text("Grade D · sample")
                .font(.caption.weight(.semibold))
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(.orange.opacity(0.15), in: Capsule())
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 28)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(.quaternary.opacity(0.35))
        )
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