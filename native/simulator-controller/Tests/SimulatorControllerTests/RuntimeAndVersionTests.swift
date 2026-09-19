import CoreSimulator
import SimulatorController
import Testing

struct RuntimeIdentifierTests {
    @Test func parsesIdentifierKeys() {
        let ios = RuntimeIdentifier.parse("com.apple.CoreSimulator.SimRuntime.iOS-26-5")
        #expect(ios.displayName == "iOS 26.5")
        #expect(ios.platform == .ios)

        let watch = RuntimeIdentifier.parse("com.apple.CoreSimulator.SimRuntime.watchOS-11-2")
        #expect(watch.displayName == "watchOS 11.2")
        #expect(watch.platform == .watchos)

        let tv = RuntimeIdentifier.parse("com.apple.CoreSimulator.SimRuntime.tvOS-18-0")
        #expect(tv.platform == .tvos)

        let xr = RuntimeIdentifier.parse("com.apple.CoreSimulator.SimRuntime.xrOS-2-0")
        #expect(xr.platform == .xros)
    }

    @Test func parsesDisplayKeys() {
        let ios = RuntimeIdentifier.parse("iOS 18.0")
        #expect(ios.displayName == "iOS 18.0")
        #expect(ios.platform == .ios)

        let unavailable = RuntimeIdentifier.parse("iOS 17.0 (unavailable)")
        #expect(unavailable.displayName == "iOS 17.0")
        #expect(unavailable.platform == .ios)
    }
}

struct XcodeVersionTests {
    @Test func parsesXcodebuildOutput() throws {
        let text = try fixtureString("xcodebuild-version.txt")
        let version = try #require(XcodeVersion.parse(xcodebuildOutput: text))
        #expect(version.major == 27)
        #expect(version.minor == 0)
        #expect(version.build == "27A266a")
        #expect(version.isAtLeast(.minimumSupported))
    }

    @Test func rejectsOldXcode() throws {
        let text = try fixtureString("xcodebuild-old.txt")
        let version = try #require(XcodeVersion.parse(xcodebuildOutput: text))
        #expect(version.major == 16)
        #expect(version.isAtLeast(.minimumSupported) == false)
    }
}

struct DeviceIDTests {
    @Test func acceptsUUID() throws {
        let id = try DeviceID.parse("939B604A-4B42-4B0C-B164-CAFAB320C123")
        #expect(id == "939B604A-4B42-4B0C-B164-CAFAB320C123")
    }

    @Test func rejectsBootedLiteral() {
        #expect(throws: SimulatorError.self) {
            _ = try DeviceID.parse("booted")
        }
        #expect(throws: SimulatorError.self) {
            _ = try DeviceID.parse("BOOTED")
        }
        #expect(throws: SimulatorError.self) {
            _ = try DeviceID.parse("current")
        }
    }

    @Test func rejectsGarbage() {
        #expect(throws: SimulatorError.self) {
            _ = try DeviceID.parse("iPhone 17 Pro")
        }
    }
}
