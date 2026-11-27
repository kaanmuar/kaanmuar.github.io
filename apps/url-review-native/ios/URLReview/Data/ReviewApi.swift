import Foundation

/// Thin HTTPS client for QA-lab URL Review (Wave 1.5). Mirrors `packages/qa-lab-mcp`.
enum ReviewApi {
    static let prodRunURL = URL(string: "https://us-central1-carlosm-interactive-cv.cloudfunctions.net/reviewRun")!
    static let prodReviewURL = URL(string: "https://us-central1-carlosm-interactive-cv.cloudfunctions.net/reviewUrl")!

    /// When true, Entry still navigates to Arena if preview fails (offline / Turnstile).
    static let useMock = true

    private static let userAgent = "URLReview-iOS/0.1 (Wave 1.5; +https://carlosandmunoz.com/qa-review)"
    private static let deviceId: String = randomHex(byteCount: 8)

    struct PreviewResponse: Sendable {
        var reportId: String?
        var host: String?
        var softLeft: Int?
        var softCap: Int?
    }

    struct StandingResponse: Sendable {
        var billing: String?
        var free: Bool
        var softLeft: Int?
        var softCap: Int?
    }

    struct OpenReportResponse: Sendable {
        var reportId: String?
        var host: String?
        var paid: Bool
        var locked: Bool
    }

    enum ReviewApiError: LocalizedError {
        case httpStatus(Int, String)
        case invalidReportId

        var errorDescription: String? {
            switch self {
            case let .httpStatus(code, message): "HTTP \(code): \(message)"
            case .invalidReportId: "Missing report id."
            }
        }
    }

    static func preview(url targetURL: String) async throws -> PreviewResponse {
        let body: [String: Any] = [
            "url": targetURL.trimmingCharacters(in: .whitespacesAndNewlines),
            "lang": "en",
            "pageLang": "en",
            "openedAt": Int(Date().timeIntervalSince1970 * 1000) - 5_000,
            "runId": randomHex(byteCount: 8),
            "deviceId": deviceId,
            "turnstileToken": "",
        ]
        let (status, json) = try await postJSON(
            prodRunURL.appending(path: "review/preview"),
            body: body
        )
        guard (200 ... 299).contains(status) else {
            let message = (json["error"] as? String) ?? "HTTP \(status)"
            throw ReviewApiError.httpStatus(status, message)
        }
        let report = json["report"] as? [String: Any] ?? json
        return PreviewResponse(
            reportId: (report["id"] as? String) ?? (json["id"] as? String),
            host: (report["host"] as? String) ?? (json["host"] as? String),
            softLeft: json["softLeft"] as? Int,
            softCap: json["softCap"] as? Int
        )
    }

    static func standing() async throws -> StandingResponse {
        let body: [String: Any] = ["deviceId": deviceId]
        let (status, json) = try await postJSON(
            prodReviewURL.appending(path: "standing"),
            body: body
        )
        guard (200 ... 299).contains(status) else {
            let message = (json["error"] as? String) ?? "HTTP \(status)"
            throw ReviewApiError.httpStatus(status, message)
        }
        return StandingResponse(
            billing: json["billing"] as? String,
            free: (json["free"] as? Bool) ?? true,
            softLeft: json["softLeft"] as? Int,
            softCap: json["softCap"] as? Int
        )
    }

    static func openReport(id reportId: String) async throws -> OpenReportResponse {
        let id = String(
            reportId
                .lowercased()
                .filter(\.isHexDigit)
                .prefix(32)
        )
        guard !id.isEmpty else { throw ReviewApiError.invalidReportId }
        let body: [String: Any] = ["id": id]
        let (status, json) = try await postJSON(
            prodReviewURL.appending(path: "review/open"),
            body: body
        )
        let hasPreview = json["preview"] != nil
        if !(200 ... 299).contains(status), !hasPreview {
            let message = (json["error"] as? String) ?? "HTTP \(status)"
            throw ReviewApiError.httpStatus(status, message)
        }
        return OpenReportResponse(
            reportId: (json["id"] as? String) ?? id,
            host: json["host"] as? String,
            paid: (json["paid"] as? Bool) ?? false,
            locked: (json["locked"] as? Bool) ?? !(200 ... 299).contains(status)
        )
    }

    private static func postJSON(_ url: URL, body: [String: Any]) async throws -> (Int, [String: Any]) {
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/x-ndjson, application/json", forHTTPHeaderField: "Accept")
        request.setValue(userAgent, forHTTPHeaderField: "User-Agent")
        request.timeoutInterval = 60
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        let contentType = (response as? HTTPURLResponse)?
            .value(forHTTPHeaderField: "Content-Type")?
            .lowercased()
        let json = parseJSONPayload(data: data, contentType: contentType)
        return (status, json)
    }

    private static func parseJSONPayload(data: Data, contentType: String?) -> [String: Any] {
        guard let text = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines),
              !text.isEmpty
        else { return [:] }

        let isNdjson = contentType?.contains("ndjson") == true || text.contains("\n")
        if isNdjson {
            var last: [String: Any] = [:]
            for line in text.split(separator: "\n") {
                let row = line.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !row.isEmpty,
                      let blob = row.data(using: .utf8),
                      let obj = try? JSONSerialization.jsonObject(with: blob) as? [String: Any]
                else { continue }
                last = obj
            }
            return last
        }
        guard let blob = text.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: blob) as? [String: Any]
        else { return [:] }
        return obj
    }

    private static func randomHex(byteCount: Int) -> String {
        var bytes = [UInt8](repeating: 0, count: byteCount)
        _ = SecRandomCopyBytes(kSecRandomDefault, byteCount, &bytes)
        return bytes.map { String(format: "%02x", $0) }.joined()
    }
}