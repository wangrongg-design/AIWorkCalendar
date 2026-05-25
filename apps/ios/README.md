# AIWorkCalendar iOS

SwiftUI iOS client for the existing Work Calendar AI API.

## Scope

- Uses the same REST API as `apps/web` and `apps/wechat-miniprogram`.
- Stores the JWT access token in Keychain and the current user locally; API base URL is configured through `Info.plist`.
- Implements login, AI-assisted work-log drafting, draft saving, work-log submission, monthly calendar dashboard, day detail, work-log search, project search and project detail.
- Uses native SwiftUI navigation, tab bars, forms, segmented controls, searchable lists, pull-to-refresh, empty states and swipe actions.

## Run

Open `apps/ios/AIWorkCalendar.xcodeproj` in Xcode and run the `AIWorkCalendar` target.

Default local API URL is configured in `AIWorkCalendar/Info.plist` as `AIWCAPIBaseURL`, currently `http://localhost:3001`. For a physical device, change that value to the Mac or server LAN address before running, for example `http://192.168.x.x:3001`.

## Local app testing

1. Start the existing API from the repo root in another terminal or control window:

   ```bash
   pnpm demo:start
   ```

   The iOS simulator can reach the Mac host through `http://localhost:3001`, so the default `AIWCAPIBaseURL` works for simulator testing. For a real iPhone, use the Mac LAN IP in `Info.plist`, for example `http://192.168.x.x:3001`.

2. In Xcode:

   - Open `apps/ios/AIWorkCalendar.xcodeproj`.
   - Select the `AIWorkCalendar` scheme.
   - Select an iOS simulator such as `iPhone 17 Pro`.
   - Press Run.

3. Login with the local demo seed account:

   - Tenant code: `demo`
   - Account: `admin@example.com`
   - Password: `Passw0rd!`

4. Smoke-test the first version:

   - Login lands on the Work Report tab.
   - Project picker loads active projects.
   - AI draft generation fills date/title/content/hours.
   - Save Draft creates a draft work log.
   - Submit sends the work log and moves it to submitted state.
   - Calendar tab loads monthly fill status.
   - Work Logs tab supports search, status filtering and swipe actions.
   - Projects tab supports search and detail view.

## Local Xcode checks

```bash
swiftc -typecheck apps/ios/AIWorkCalendar/*.swift
xcodebuild \
  -project apps/ios/AIWorkCalendar.xcodeproj \
  -scheme AIWorkCalendar \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.5' \
  -configuration Debug \
  CODE_SIGNING_ALLOWED=NO \
  -derivedDataPath /tmp/AIWorkCalendarDerivedData \
  build
```

The Xcode build requires an installed iOS simulator runtime even when building for device SDK, because asset catalog compilation asks CoreSimulator for available runtimes. If `xcrun simctl list runtimes` prints no iOS runtime, install one in Xcode Settings > Components before running simulator builds.

The same app can be installed and launched from the command line after building:

```bash
xcrun simctl boot "iPhone 17 Pro" || true
xcrun simctl bootstatus "iPhone 17 Pro" -b
xcrun simctl install "iPhone 17 Pro" /tmp/AIWorkCalendarDerivedData/Build/Products/Debug-iphonesimulator/AIWorkCalendar.app
xcrun simctl launch "iPhone 17 Pro" com.aiworkcalendar.app
```
