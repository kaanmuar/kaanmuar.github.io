import SwiftUI
import WebKit

struct ArenaView: View {
    let draft: ReviewDraft
    let onContinue: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            if let url = draft.normalizedURL {
                Text(url.absoluteString)
                    .font(.caption)
                    .lineLimit(1)
                    .truncationMode(.middle)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal)
                    .padding(.vertical, 8)
                    .background(.ultraThinMaterial)
            }

            ArenaWebView(url: draft.normalizedURL)
                .ignoresSafeArea(edges: .bottom)

            HStack {
                Text("Arena stub — live capture comes in a later wave.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                Spacer()
                Button("View report", action: onContinue)
                    .buttonStyle(.borderedProminent)
            }
            .padding()
            .background(.bar)
        }
        .navigationTitle("Arena")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct ArenaWebView: UIViewRepresentable {
    let url: URL?

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.allowsBackForwardNavigationGestures = true
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        guard let url else {
            webView.loadHTMLString(Self.placeholderHTML, baseURL: nil)
            return
        }
        if webView.url != url {
            webView.load(URLRequest(url: url))
        }
    }

    private static let placeholderHTML = """
    <!DOCTYPE html>
    <html><head><meta name="viewport" content="width=device-width, initial-scale=1">
    <style>body{font-family:-apple-system,sans-serif;padding:2rem;color:#666;}</style></head>
    <body><h2>URL Review Arena</h2><p>Enter a valid URL on the previous screen.</p></body></html>
  """
}

#Preview {
    NavigationStack {
        ArenaView(
            draft: ReviewDraft(inputURL: "https://example.com", normalizedURL: URL(string: "https://example.com")),
            onContinue: {}
        )
    }
}