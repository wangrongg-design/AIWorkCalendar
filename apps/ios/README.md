# AIWorkCalendar iOS

SwiftUI iOS client for the existing Work Calendar AI API.

## Scope

- Uses the same REST API as `apps/web` and `apps/wechat-miniprogram`.
- Stores the JWT access token in Keychain and the current user/API base URL locally.
- Implements login, AI-assisted work-log drafting, draft saving, work-log submission, monthly calendar dashboard, day detail, work-log search, project search and project detail.
- Uses native SwiftUI navigation, tab bars, forms, segmented controls, searchable lists, pull-to-refresh, empty states and swipe actions.

## Run

Open `apps/ios/AIWorkCalendar.xcodeproj` in Xcode and run the `AIWorkCalendar` target.

Default local API URL is `http://localhost:3001`, matching the project README. For a physical device, replace it on the login screen with the Mac or server LAN address.

## Local Xcode checks

```bash
swiftc -typecheck apps/ios/AIWorkCalendar/*.swift
xcodebuild -project apps/ios/AIWorkCalendar.xcodeproj -target AIWorkCalendar -sdk iphoneos26.5 -configuration Debug CODE_SIGNING_ALLOWED=NO build
```

The Xcode build requires an installed iOS simulator runtime even when building for device SDK, because asset catalog compilation asks CoreSimulator for available runtimes. If `xcrun simctl list runtimes` prints no iOS runtime, install one in Xcode Settings > Components before running simulator builds.
