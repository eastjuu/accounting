import Foundation

/// 앱 데이터 파일.
/// - Documents/ledger.json: 장부 전체 (엔진의 serialize() 결과)
/// - Documents/백업/ledger-yyyy-MM-dd.json: 날짜별 마지막 상태, 30개까지 보관
/// - Documents/.queue/*.txt: 단축어가 넣은 알림 (앱이 열릴 때 처리 후 삭제). 알림 하나 = 파일 하나라 동시에 써도 안전해요.
enum LedgerStore {
    private static let fm = FileManager.default
    static var docs: URL { fm.urls(for: .documentDirectory, in: .userDomainMask)[0] }
    static var dataURL: URL { docs.appendingPathComponent("ledger.json") }
    static var backupDir: URL { docs.appendingPathComponent("백업", isDirectory: true) }
    static var queueDir: URL { docs.appendingPathComponent(".queue", isDirectory: true) }

    static func read() -> String? {
        try? String(contentsOf: dataURL, encoding: .utf8)
    }

    static func write(_ json: String) {
        do {
            try json.write(to: dataURL, atomically: true, encoding: .utf8)
        } catch {
            NSLog("ledger write failed: \(error)")
            return
        }
        backupDaily(json)
    }

    private static func backupDaily(_ json: String) {
        try? fm.createDirectory(at: backupDir, withIntermediateDirectories: true)
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(identifier: "Asia/Seoul")
        let url = backupDir.appendingPathComponent("ledger-\(f.string(from: Date())).json")
        try? json.write(to: url, atomically: true, encoding: .utf8)
        if let items = try? fm.contentsOfDirectory(at: backupDir, includingPropertiesForKeys: nil) {
            let files = items.filter { $0.pathExtension == "json" }.sorted { $0.lastPathComponent > $1.lastPathComponent }
            for old in files.dropFirst(30) { try? fm.removeItem(at: old) }
        }
    }

    static func enqueue(_ text: String) throws {
        try fm.createDirectory(at: queueDir, withIntermediateDirectories: true)
        let name = String(format: "%013.0f", Date().timeIntervalSince1970 * 1000) + "-" + UUID().uuidString + ".txt"
        try text.write(to: queueDir.appendingPathComponent(name), atomically: true, encoding: .utf8)
    }

    static func queued() -> [(id: String, text: String)] {
        guard let items = try? fm.contentsOfDirectory(at: queueDir, includingPropertiesForKeys: nil) else { return [] }
        return items
            .filter { $0.pathExtension == "txt" }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
            .compactMap { url in
                guard let text = try? String(contentsOf: url, encoding: .utf8) else { return nil }
                return (url.lastPathComponent, text)
            }
    }

    static func removeQueued(_ ids: [String]) {
        for id in ids where !id.contains("/") && !id.contains("..") {
            try? fm.removeItem(at: queueDir.appendingPathComponent(id))
        }
    }
}
