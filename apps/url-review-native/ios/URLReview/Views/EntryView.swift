import SwiftUI

/// Soft-gate entry — parity with web spearhead / #4503 mocks (#4511).
private enum SoftGate {
    static let background = Color(red: 0x05 / 255, green: 0x0d / 255, blue: 0x11 / 255)
    static let surface = Color(red: 0x07 / 255, green: 0x11 / 255, blue: 0x16 / 255)
    static let cyan = Color(red: 0x7e / 255, green: 0xf6 / 255, blue: 0xfb / 255)
    static let mint = Color(red: 0x5d / 255, green: 0xff / 255, blue: 0x9a / 255)
    static let text = Color(red: 0xe8 / 255, green: 0xf3 / 255, blue: 0xf4 / 255)
    static let muted = Color(red: 0x8e / 255, green: 0xa8 / 255, blue: 0xae / 255)
    static let line = Color(red: 0x7e / 255, green: 0xd6 / 255, blue: 0xe0 / 255).opacity(0.28)
    static let onMint = Color(red: 0x04 / 255, green: 0x10 / 255, blue: 0x14 / 255)
}

private let FlawChips = [
    "Speed Trap",
    "SEO Leaks",
    "Trust Gaps",
    "UX Friction",
]

struct EntryView: View {
    @State private var urlText = "https://"
    @State private var selectedChip: String? = "Speed Trap"
    @State private var isRunning = false
    @FocusState private var urlFocused: Bool

    let onRun: (ReviewDraft) -> Void

    var body: some View {
        ZStack {
            SoftGate.background.ignoresSafeArea()
            RadialGradient(
                colors: [SoftGate.cyan.opacity(0.12), .clear],
                center: .topLeading,
                startRadius: 20,
                endRadius: 320,
            )
            .ignoresSafeArea()

            VStack(alignment: .leading, spacing: 0) {
                brandRow
                    .padding(.horizontal, 18)
                    .padding(.top, 8)

                heroCaption
                    .padding(.horizontal, 18)
                    .padding(.top, 18)

                Spacer(minLength: 12)

                dock
            }
        }
        .preferredColorScheme(.dark)
        .toolbar(.hidden, for: .navigationBar)
        .onAppear { urlFocused = true }
    }

    private var brandRow: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text("QA-lab")
                    .font(.system(size: 22, weight: .semibold, design: .serif))
                    .foregroundStyle(SoftGate.text)
                Text("URL REVIEW")
                    .font(.system(size: 11, weight: .bold))
                    .tracking(1.6)
                    .foregroundStyle(SoftGate.cyan)
            }
            Spacer(minLength: 8)
            Text("Bench ready")
                .font(.system(size: 11, weight: .semibold))
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(SoftGate.mint.opacity(0.16), in: Capsule())
                .overlay(Capsule().strokeBorder(SoftGate.mint.opacity(0.45)))
                .foregroundStyle(SoftGate.mint)
        }
    }

    private var heroCaption: some View {
        (Text("Drop a URL on the ")
            .foregroundStyle(SoftGate.muted)
            + Text("specimen tray")
            .foregroundStyle(SoftGate.cyan)
            .fontWeight(.semibold))
            .font(.system(size: 15))
    }

    private var dock: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Specimen URL")
                .font(.system(size: 11, weight: .bold))
                .tracking(1.2)
                .textCase(.uppercase)
                .foregroundStyle(SoftGate.muted)

            TextField("https://example.com", text: $urlText)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.URL)
                .textContentType(.URL)
                .focused($urlFocused)
                .foregroundStyle(SoftGate.text)
                .padding(14)
                .background(SoftGate.surface, in: RoundedRectangle(cornerRadius: 12))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .strokeBorder(SoftGate.line),
                )

            Text("Call the flaw before we run it")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(SoftGate.muted)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(FlawChips, id: \.self) { chip in
                        let on = selectedChip == chip
                        Button {
                            selectedChip = on ? nil : chip
                        } label: {
                            Text(chip)
                                .font(.system(size: 13, weight: .semibold))
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .foregroundStyle(on ? SoftGate.onMint : SoftGate.text)
                                .background(
                                    on ? SoftGate.mint : SoftGate.surface,
                                    in: Capsule(),
                                )
                                .overlay(
                                    Capsule().strokeBorder(on ? SoftGate.mint : SoftGate.line),
                                )
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            Button(action: runTapped) {
                Text(isRunning ? "Running…" : "Run diagnostics")
                    .font(.system(size: 16, weight: .bold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .foregroundStyle(SoftGate.onMint)
                    .background(
                        LinearGradient(
                            colors: [SoftGate.cyan, SoftGate.mint],
                            startPoint: .leading,
                            endPoint: .trailing,
                        ),
                        in: RoundedRectangle(cornerRadius: 14),
                    )
            }
            .buttonStyle(.plain)
            .disabled(
                urlText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isRunning,
            )
            .opacity(
                urlText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isRunning
                    ? 0.45 : 1,
            )

            Text("Soft preview · 1 page · same gate as web spearhead")
                .font(.system(size: 12))
                .foregroundStyle(SoftGate.muted)
        }
        .padding(18)
        .padding(.bottom, 8)
        .background(
            SoftGate.surface.opacity(0.92)
                .overlay(
                    Rectangle()
                        .fill(SoftGate.line)
                        .frame(height: 1),
                    alignment: .top,
                ),
        )
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
                onRun(ReviewDraft(inputURL: trimmed, normalizedURL: Self.normalizeURL(trimmed)))
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
