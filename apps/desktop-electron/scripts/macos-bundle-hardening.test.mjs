import { describe, expect, it } from "vitest";

import { hardenMacInfoPlist } from "./macos-bundle-hardening.mjs";

describe("hardenMacInfoPlist", () => {
  it("removes unused privacy prompts and allows insecure HTTP only for the local player", () => {
    const hardened = hardenMacInfoPlist({
      CFBundleIdentifier: "br.com.gbastudio.desktop",
      NSAudioCaptureUsageDescription: "generic audio permission",
      NSBluetoothAlwaysUsageDescription: "generic bluetooth permission",
      NSBluetoothPeripheralUsageDescription: "generic bluetooth permission",
      NSCameraUsageDescription: "generic camera permission",
      NSMicrophoneUsageDescription: "generic microphone permission",
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoads: true,
        NSExceptionDomains: {
          "example.com": {
            NSExceptionAllowsInsecureHTTPLoads: true
          }
        }
      }
    });

    expect(hardened).toMatchObject({
      CFBundleIdentifier: "br.com.gbastudio.desktop",
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoads: false,
        NSAllowsLocalNetworking: true,
        NSExceptionDomains: {
          localhost: {
            NSExceptionAllowsInsecureHTTPLoads: true,
            NSIncludesSubdomains: false
          },
          "127.0.0.1": {
            NSExceptionAllowsInsecureHTTPLoads: true,
            NSIncludesSubdomains: false
          }
        }
      }
    });
    expect(hardened.NSAppTransportSecurity.NSExceptionDomains).not.toHaveProperty("example.com");
    expect(hardened).not.toHaveProperty("NSAudioCaptureUsageDescription");
    expect(hardened).not.toHaveProperty("NSBluetoothAlwaysUsageDescription");
    expect(hardened).not.toHaveProperty("NSBluetoothPeripheralUsageDescription");
    expect(hardened).not.toHaveProperty("NSCameraUsageDescription");
    expect(hardened).not.toHaveProperty("NSMicrophoneUsageDescription");
  });

  it("does not mutate the source object", () => {
    const source = {
      NSCameraUsageDescription: "generic camera permission",
      NSAppTransportSecurity: { NSAllowsArbitraryLoads: true }
    };

    hardenMacInfoPlist(source);

    expect(source).toEqual({
      NSCameraUsageDescription: "generic camera permission",
      NSAppTransportSecurity: { NSAllowsArbitraryLoads: true }
    });
  });
});
