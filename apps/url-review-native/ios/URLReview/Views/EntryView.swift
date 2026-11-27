import SwiftUI

struct EntryView: View {
    private static let predictionChips = [
        "Homepage",
        "Pricing",
        "Contact",
        "Blog",
        "Login"
    ]

    @State private var urlText = "https://"
    @State private var isRunning = false
    @FocusState private var urlFocused: Bool

    let onRun: (ReviewDraft) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Paste a URL to review. Predictions are stubs until the API ships.")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            TextField("https://example.com", text: $urlText)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.URL)
                .textContentType(.URL)
                .focused($urlFocused)
                .padding(12)
                .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 10))

            VStack(alignment: .leading, spacing: 8) {
                Text("Predictions")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.secondary)

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(Self.predictionChips, id: \.self) { chip in
                            Text(chip)
                                .font(.footnote)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 6)
                                .background(.thinMaterial, in: Capsule())
                                .overlay(Capsule().strokeBorder(.quaternary))
                        }
                    }
                }
            }

            Spacer(minLength: 0)

            Button(action: runTapped) {
                Label("Run review", systemImage: "play.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(
                urlText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isRunning
            )
        }
        .padding()
        .onAppear { urlFocused = true }
    }

    private func runTapped() {
        let trimmed = urlText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !isRunning else { return }
        isRunning = true
        Task {
            let proceed: Bool
            do {
                _ = try await ReviewApi.preview(url: trimmed)
                proceed = true
            } catch {
                proceed = ReviewApi.useMock
            }
            await MainActor.run {
                isRunning = false
                guard proceed else { return }
                let normalized = Self.normalizeURL(trimmed)
                onRun(ReviewDraft(inputURL: trimmed, normalizedURL: normalized))
            }
        }
    }

    private static func normalizeURL(_ raw: String) -> URL? {
        var candidate = raw
        if !candidate.contains("://") {
            candidate = "https://\(candidate)"
        }
        guard var components = URLComponents(string: candidate),
              let host = components.host, !host.isEmpty else {
            return nil
        }
        if components.scheme == nil {
            components.scheme = "https"
        }
        return components.url
    }
}

#Preview {
    NavigationStack {
        EntryView { _ in }
    }
}