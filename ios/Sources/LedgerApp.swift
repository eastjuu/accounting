import SwiftUI
import WebKit

/// 가계부 iOS 앱: 화면은 웹과 같은 Index.html, 장부 엔진은 Code.gs를 앱 안에서 실행(engine.js).
/// 데이터는 이 아이폰의 Documents/ledger.json (파일 앱 › 가계부)에 저장해요.
@main
struct LedgerApp: App {
    @Environment(\.scenePhase) private var phase
    @StateObject private var model = WebModel()
    /// 앱이 열려 있는 동안 단축어가 넣은 알림도 바로 처리하려고 3초마다 대기열을 봐요(파일 목록만 확인해서 가벼움)
    private let tick = Timer.publish(every: 3, on: .main, in: .common).autoconnect()

    var body: some Scene {
        WindowGroup {
            WebView(web: model.web)
                .ignoresSafeArea()
                .background(Color(UIColor.systemGroupedBackground))
                .onChange(of: phase) { _, p in
                    if p == .active { model.drainQueue() }
                }
                .onReceive(tick) { _ in
                    if phase == .active { model.drainQueue() }
                }
        }
    }
}

struct WebView: UIViewRepresentable {
    let web: WKWebView
    func makeUIView(context: Context) -> WKWebView { web }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
