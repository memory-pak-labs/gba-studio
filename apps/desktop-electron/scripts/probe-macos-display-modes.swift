import CoreGraphics
import Foundation

func describe(_ mode: CGDisplayMode) -> [String: Any] {
    return ["width": mode.width, "height": mode.height,
            "pixelWidth": mode.pixelWidth, "pixelHeight": mode.pixelHeight,
            "refreshRate": mode.refreshRate]
}

let display = CGMainDisplayID()
guard let current = CGDisplayCopyDisplayMode(display) else {
    fatalError("Main display mode unavailable")
}
let modes = CGDisplayCopyAllDisplayModes(display, nil) as? [CGDisplayMode] ?? []
let candidates = modes.filter { $0.refreshRate >= 55 && $0.refreshRate <= 65 }
let target = candidates.min { left, right in
    abs(left.pixelWidth-current.pixelWidth) + abs(left.pixelHeight-current.pixelHeight)
      < abs(right.pixelWidth-current.pixelWidth) + abs(right.pixelHeight-current.pixelHeight)
}
var action = "inspect-only"
if CommandLine.arguments.contains("--configure-ci-60hz") {
    guard ProcessInfo.processInfo.environment["GITHUB_ACTIONS"] == "true" else {
        fatalError("Display configuration is allowed only on an ephemeral GitHub Actions runner")
    }
    if current.refreshRate >= 55 && current.refreshRate <= 65 {
        action = "already-60hz"
    } else if let target = target {
        let status = CGDisplaySetDisplayMode(display, target, nil)
        action = "configuration-result-\(status.rawValue)"
    } else {
        action = "no-advertised-60hz-mode"
    }
}
let evidence: [String: Any] = [
    "displayID": display, "before": describe(current), "action": action,
    "availableRefreshRates": Array(Set(modes.map { $0.refreshRate })).sorted(),
    "candidateModes": candidates.map(describe),
    "after": CGDisplayCopyDisplayMode(display).map(describe) ?? [:]
]
let json = try JSONSerialization.data(withJSONObject: evidence, options: [.prettyPrinted, .sortedKeys])
print(String(data: json, encoding: .utf8)!)
