import SwiftUI
import WebKit

struct ArenaView: View {
    let draft: ReviewDraft
    let onContinue: () -> Void
    let onCancel: () -> Void

    @State private var progress: Int = 0

    var body: some View {
        VStack(spacing: 0) {
            if progress > 0 && progress < 100 {
                ProgressView(value: Double(progress), total: 100)
                    .padding(.horizontal)
            }

            ArenaWebView(
                host: hostLabel,
                onProgress: { progress = $0 },
                onFinish: onContinue,
                onCancel: onCancel,
            )
            .ignoresSafeArea(edges: .bottom)

            HStack {
                Text("\(progress)% · Lab Tries arena")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                Spacer()
                Button("Cancel", role: .cancel) {
                    onCancel()
                }
            }
            .padding()
            .background(.bar)
        }
        .navigationTitle("Arena")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Back") {
                    onCancel()
                }
            }
        }
    }

    private var hostLabel: String {
        if let host = draft.normalizedURL?.host, !host.isEmpty {
            return host
        }
        let trimmed = draft.inputURL
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "^https?://", with: "", options: .regularExpression)
        let host = trimmed.split(separator: "/").first.map(String.init) ?? ""
        return host.isEmpty ? "example.com" : host
    }
}

struct ArenaWebView: UIViewRepresentable {
    let host: String
    let onProgress: (Int) -> Void
    let onFinish: () -> Void
    let onCancel: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onProgress: onProgress, onFinish: onFinish, onCancel: onCancel)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        configuration.setValue(true, forKey: "allowUniversalAccessFromFileURLs")
        configuration.userContentController.add(context.coordinator, name: "urlReview")

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.scrollView.isScrollEnabled = false
        context.coordinator.webView = webView
        context.coordinator.loadArena(host: host)
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        context.coordinator.webView = webView
    }

    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "urlReview")
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        weak var webView: WKWebView?
        let onProgress: (Int) -> Void
        let onFinish: () -> Void
        let onCancel: () -> Void

        init(onProgress: @escaping (Int) -> Void, onFinish: @escaping () -> Void, onCancel: @escaping () -> Void) {
            self.onProgress = onProgress
            self.onFinish = onFinish
            self.onCancel = onCancel
        }

        func loadArena(host: String) {
            guard let index = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Arena") else {
                return
            }
            let dir = index.deletingLastPathComponent()
            var components = URLComponents(url: index, resolvingAgainstBaseURL: false)
            components?.queryItems = [URLQueryItem(name: "host", value: host)]
            guard let url = components?.url else { return }
            webView?.loadFileURL(url, allowingReadAccessTo: dir)
        }

        func userContentController(
            _ userContentController: WKUserContentController,
            didReceive message: WKScriptMessage
        ) {
            guard message.name == "urlReview",
                  let body = message.body as? [String: Any],
                  let type = body["type"] as? String else {
                return
            }
            switch type {
            case "progress":
                if let pct = body["percent"] as? Int {
                    DispatchQueue.main.async { self.onProgress(pct) }
                }
            case "finish":
                DispatchQueue.main.async { self.onFinish() }
            case "cancel":
                DispatchQueue.main.async { self.onCancel() }
            default:
                break
            }
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            // Keep native chrome visible if a resource fails.
        }
    }
}

#Preview {
    NavigationStack {
        ArenaView(
            draft: ReviewDraft(inputURL: "https://example.com", normalizedURL: URL(string: "https://example.com")),
            onContinue: {},
            onCancel: {},
        )
    }
}