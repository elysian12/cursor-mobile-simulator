import Foundation

/// Fallback point sizes when the simulator is not booted (getenv unavailable)
/// and FBSC `deviceType.mainScreenSize` is not linked. Values are device points,
/// origin top-left. Prefer live `simctl getenv SIMULATOR_MAINSCREEN_*` on Booted devices.
public enum KnownScreens: Sendable {
    public static func screen(deviceTypeIdentifier: String?) -> ScreenInfo? {
        guard let identifier = deviceTypeIdentifier?.lowercased() else { return nil }
        for (suffix, screen) in table where identifier.contains(suffix) {
            return screen
        }
        return nil
    }

    private static let table: [(String, ScreenInfo)] = [
        ("iphone-se-3rd-generation", ScreenInfo(width: 375, height: 667, scale: 2)),
        ("iphone-se--2nd-generation", ScreenInfo(width: 375, height: 667, scale: 2)),
        ("iphone-se", ScreenInfo(width: 320, height: 568, scale: 2)),
        ("iphone-16-pro-max", ScreenInfo(width: 440, height: 956, scale: 3)),
        ("iphone-16-plus", ScreenInfo(width: 430, height: 932, scale: 3)),
        ("iphone-16-pro", ScreenInfo(width: 402, height: 874, scale: 3)),
        ("iphone-16", ScreenInfo(width: 393, height: 852, scale: 3)),
        ("iphone-17-pro-max", ScreenInfo(width: 440, height: 956, scale: 3)),
        ("iphone-17-pro", ScreenInfo(width: 402, height: 874, scale: 3)),
        ("iphone-17e", ScreenInfo(width: 390, height: 844, scale: 3)),
        ("iphone-17", ScreenInfo(width: 402, height: 874, scale: 3)),
        ("iphone-air", ScreenInfo(width: 420, height: 912, scale: 3)),
    ]
}
