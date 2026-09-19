import CoreSimulator
import Foundation
import Testing

struct DeviceListParserTests {
    @Test func parsesSimctlListJSON() throws {
        let devices = try DeviceListParser.parse(fixtureData("simctl-list.json"))
        #expect(devices.count == 7)

        let pro = try #require(devices.first { $0.udid == "939B604A-4B42-4B0C-B164-CAFAB320C123" })
        #expect(pro.name == "iPhone 17 Pro")
        #expect(pro.state == "Shutdown")
        #expect(pro.runtimeDisplay == "iOS 26.5")
        #expect(pro.platform == .ios)
        #expect(pro.isAvailable)

        let booted = try #require(devices.first { $0.name == "iPhone 17 Pro Max" })
        #expect(booted.state == "Booted")

        let legacy = try #require(devices.first { $0.name == "Legacy iPhone" })
        #expect(legacy.runtimeDisplay == "iOS 17.2")
        #expect(legacy.platform == .ios)
        #expect(legacy.state == "Creating")

        let watch = try #require(devices.first { $0.name == "Apple Watch" })
        #expect(watch.platform == .watchos)
        #expect(watch.runtimeDisplay == "watchOS 11.2")

        let unavailable = try #require(devices.first { $0.name == "Unavailable Phone" })
        #expect(unavailable.isAvailable == false)
    }

    @Test func iosFilterExcludesWatchAndTV() throws {
        let devices = try DeviceListParser.parse(fixtureData("simctl-list.json"))
        let ios = devices.filter(\.platform.isIOSCompatible)
        #expect(ios.count == 5)
        #expect(ios.allSatisfy { $0.platform == .ios })
    }
}

private extension SimPlatform {
    var isIOSCompatible: Bool { self == .ios }
}

func fixtureURL(_ name: String) -> URL {
    if let url = Bundle.module.url(forResource: name, withExtension: nil, subdirectory: "Fixtures") {
        return url
    }
    let base = (name as NSString).deletingPathExtension
    let ext = (name as NSString).pathExtension
    if let url = Bundle.module.url(forResource: base, withExtension: ext, subdirectory: "Fixtures") {
        return url
    }
    fatalError("Missing test fixture \(name) in Bundle.module. Fixtures: \(Bundle.module.bundlePath)")
}

func fixtureData(_ name: String) throws -> Data {
    try Data(contentsOf: fixtureURL(name))
}

func fixtureString(_ name: String) throws -> String {
    try String(contentsOf: fixtureURL(name), encoding: .utf8)
}
