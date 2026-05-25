import SwiftUI

struct RootView: View {
    @StateObject private var auth = AuthStore()

    var body: some View {
        Group {
            if auth.isAuthenticated {
                MainTabView()
                    .environmentObject(auth)
            } else {
                LoginView()
                    .environmentObject(auth)
            }
        }
        .task {
            await auth.refreshMeIfPossible()
        }
    }
}

struct MainTabView: View {
    var body: some View {
        TabView {
            ReportEntryView()
                .tabItem {
                    Label("填报", systemImage: "square.and.pencil")
                }

            CalendarDashboardView()
                .tabItem {
                    Label("月历", systemImage: "calendar")
                }

            WorkLogsView()
                .tabItem {
                    Label("记录", systemImage: "list.bullet.rectangle")
                }

            ProjectsView()
                .tabItem {
                    Label("项目", systemImage: "folder")
                }

            ProfileView()
                .tabItem {
                    Label("我的", systemImage: "person.crop.circle")
                }
        }
    }
}

struct ProfileView: View {
    @EnvironmentObject private var auth: AuthStore

    var body: some View {
        NavigationStack {
            List {
                if let user = auth.user {
                    Section("账号") {
                        LabeledContent("姓名", value: user.name)
                        LabeledContent("企业", value: user.tenantName)
                        LabeledContent("企业代码", value: user.tenantCode)
                        if let departmentName = user.departmentName {
                            LabeledContent("部门", value: departmentName)
                        }
                        if let email = user.email {
                            LabeledContent("邮箱", value: email)
                        }
                    }

                    Section("权限") {
                        ForEach(user.roles, id: \.rawValue) { role in
                            Text(role.rawValue)
                        }
                    }
                }

                Section("接口") {
                    LabeledContent("API", value: auth.apiBaseURL)
                }

                Section {
                    Button("退出登录", role: .destructive) {
                        auth.logout()
                    }
                }
            }
            .navigationTitle("我的")
        }
    }
}
