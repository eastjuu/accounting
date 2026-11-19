import UIKit
import WebKit

/// 화면(WKWebView)과 앱 사이 다리.
/// - 시작할 때 저장된 장부(ledger.json)를 window.__LEDGER_DATA로 넣어 줘요.
/// - 화면이 보내는 메시지(window.webkit.messageHandlers.ledger): save(장부 저장) / ready / ingested(대기열 처리 끝) / share(백업 보내기)
/// - 단축어가 넣은 알림 대기열을 화면의 __ledgerIngest()에 넘겨 분류하게 해요.
final class WebModel: NSObject, ObservableObject, WKScriptMessageHandler, WKNavigationDelegate {
    let web: WKWebView
    private var ready = false
    private var draining = false

    override init() {
        let config = WKWebViewConfiguration()
        let content = WKUserContentController()
        config.userContentController = content
        let data = LedgerStore.read() ?? "null"
        let boot = "window.__LEDGER_LOCAL=true;window.__LEDGER_DATA=\(data);"
        content.addUserScript(WKUserScript(source: boot, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        web = WKWebView(frame: .zero, configuration: config)
        super.init()
        content.add(WeakHandler(self), name: "ledger")
        web.navigationDelegate = self
        web.isOpaque = false
        web.backgroundColor = UIColor.systemGroupedBackground
        web.scrollView.backgroundColor = UIColor.systemGroupedBackground
        web.scrollView.contentInsetAdjustmentBehavior = .never   // 화면(CSS)이 safe-area를 직접 처리해요
        web.scrollView.bounces = false
        web.allowsLinkPreview = false
        if #available(iOS 16.4, *) { web.isInspectable = true }
        if let dir = Bundle.main.url(forResource: "Web", withExtension: nil) {
            web.loadFileURL(dir.appendingPathComponent("index.html"), allowingReadAccessTo: dir)
        }
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        switch type {
        case "save":
            if let data = body["data"] as? String { LedgerStore.write(data) }
        case "ready":
            ready = true
            drainQueue()
        case "ingested":
            let ids = body["ids"] as? [String] ?? []
            LedgerStore.removeQueued(ids)
            draining = false
        case "share":
            shareBackup()
        default:
            break
        }
    }

    /// 단축어 대기열 → 화면에서 분류 (분류 규칙·과거 전표 학습·같은 결제 중복 거르기는 서버와 같은 코드)
    func drainQueue() {
        guard ready, !draining else { return }
        let items = LedgerStore.queued()
        guard !items.isEmpty else { return }
        let list = items.map { ["id": $0.id, "text": $0.text] }
        guard let json = try? JSONSerialization.data(withJSONObject: list), let s = String(data: json, encoding: .utf8) else { return }
        draining = true
        web.evaluateJavaScript("window.__ledgerIngest && window.__ledgerIngest(\(s))") { [weak self] _, error in
            if error != nil { self?.draining = false }
        }
    }

    /// 백업: 지금 장부 파일을 공유 시트로 (파일 앱 저장, 에어드롭, 메일 등)
    private func shareBackup() {
        let url = LedgerStore.dataURL
        guard FileManager.default.fileExists(atPath: url.path) else { return }
        let vc = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        guard let root = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene }).flatMap({ $0.windows }).first(where: { $0.isKeyWindow })?.rootViewController else { return }
        var top = root
        while let next = top.presentedViewController { top = next }
        vc.popoverPresentationController?.sourceView = top.view
        top.present(vc, animated: true)
    }

    /// 외부 링크(https)는 사파리로, 앱 안 파일만 웹뷰에서 열어요
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = action.request.url, url.scheme == "https" || url.scheme == "http", action.navigationType == .linkActivated {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }
}

/// WKUserContentController가 핸들러를 강하게 붙잡아서 생기는 순환 참조를 피하려는 얇은 래퍼
final class WeakHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(controller, didReceive: message)
    }
}
