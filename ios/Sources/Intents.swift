import AppIntents

/// 단축어 동작 "가계부에 알림 기록": 알림 원문을 앱 대기열에 넣어요(앱을 열지 않음).
/// 앱이 열리면(또는 열려 있으면 3초 안에) 서버와 같은 규칙으로 분류해 전표·수신함에 반영해요.
/// 기존 단축어의 "URL 콘텐츠 가져오기"를 이 동작으로 바꾸면 돼요. 인터넷·키가 필요 없어요.
struct RecordAlertIntent: AppIntent {
    static let title: LocalizedStringResource = "가계부에 알림 기록"
    static let description = IntentDescription("결제·입출금 알림 원문을 가계부 앱의 수신함에 넣어요. 앱을 열면 분류 규칙·과거 전표로 분개돼요.")
    static let openAppWhenRun: Bool = false

    @Parameter(title: "알림 원문")
    var text: String

    func perform() async throws -> some IntentResult & ReturnsValue<String> {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return .result(value: "빈 알림이라 넣지 않았어요") }
        try LedgerStore.enqueue(t)
        return .result(value: "가계부에 넣었어요 · 앱을 열면 분류돼요")
    }
}

struct LedgerShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: RecordAlertIntent(),
            phrases: ["\(.applicationName)에 알림 기록"],
            shortTitle: "알림 기록",
            systemImageName: "tray.and.arrow.down"
        )
    }
}
