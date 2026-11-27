import SwiftUI

struct ContentView: View {
    @State private var path = NavigationPath()

    var body: some View {
        NavigationStack(path: $path) {
            EntryView { draft in
                path.append(ReviewFlow.arena(draft))
            }
            .navigationDestination(for: ReviewFlow.self) { step in
                switch step {
                case let .arena(draft):
                    ArenaView(
                        draft: draft,
                        onContinue: {
                            path.append(ReviewFlow.report(draft))
                        },
                        onCancel: {
                            if !path.isEmpty {
                                path.removeLast()
                            }
                        },
                    )
                case let .report(draft):
                    ReportView(draft: draft) {
                        path = NavigationPath()
                    }
                }
            }
        }
    }
}

enum ReviewFlow: Hashable {
    case arena(ReviewDraft)
    case report(ReviewDraft)
}

struct ReviewDraft: Hashable {
    var inputURL: String
    var normalizedURL: URL?
}

#Preview {
    ContentView()
}