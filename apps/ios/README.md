# AIWorkCalendar iOS

SwiftUI iOS client for the existing Work Calendar AI API.

## Scope

- Uses the same REST API as `apps/web` and `apps/wechat-miniprogram`.
- Stores the JWT access token in Keychain and the current user locally; API base URL is configured through `Info.plist`.
- Implements login, AI-assisted work-log drafting, draft saving, work-log submission, monthly calendar dashboard, day detail, work-log search, project search and project detail.
- Uses native SwiftUI navigation, tab bars, forms, segmented controls, searchable lists, pull-to-refresh, empty states and swipe actions.

## iOS VI and design system

All new iOS UI should use `AITheme` in `AIWorkCalendar/AppDesign.swift` instead of hard-coded colors, radii or typography.

- Primary actions, selected tabs and key links use Primary Blue `#0B57D0`.
- AI insight, smart suggestions and privacy/safety messaging use AI Teal `#0F766E`.
- Submitted/completed/healthy states use Success `#16A34A`.
- Missing reports, near deadlines and attention states use Warning `#D97706`.
- Real risks, blockers, failures and destructive actions use Danger `#DC2626`.
- Page background is Surface `#F8FAFC`; main panels are white in light mode and dark panels in dark mode.
- Body and secondary copy must stay readable; do not use text lighter than the `textSecondary` token for normal explanatory text.
- Cards use 16pt radius, buttons and inputs use 12pt radius, tags use capsule styling.
- AI modules should present a conclusion, evidence/risk and an available action when the page has a clear next step.
- Keep the iOS app native: use SwiftUI navigation, bottom tabs, SF Symbols, system fonts, semantic colors, Dynamic Type, safe areas and standard iOS search/filter patterns.

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

   - Account: `admin@example.com`
   - Password: `Passw0rd!`

   The login page does not require a tenant code by default. If the API reports that the account exists in multiple companies, expand `高级选项` and enter tenant code `demo`.

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
