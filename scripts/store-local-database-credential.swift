// macOS-only interactive bootstrap. Never prints credentials or accepts them
// as arguments. Uses Security.framework instead of secret-bearing CLI flags.
import Foundation
import Security

enum SetupFailure: Error { case invalidConnection, invalidPassword, cancelled, existing, keychain }
let project = "mgqpxfbdhmiygdytgswi"

func connection(_ template: String, password: String) throws -> String {
    guard !password.isEmpty, password.utf8.count <= 4096,
          !password.contains("\0"), !password.contains("\n"), !password.contains("\r"),
          var url = URLComponents(string: template),
          ["postgres", "postgresql"].contains(url.scheme ?? ""),
          let host = url.host?.lowercased(), url.path == "/postgres",
          url.fragment == nil, url.port == nil || url.port == 5432 else { throw SetupFailure.invalidConnection }
    let direct = host == "db.\(project).supabase.co" && url.user == "postgres"
    let pooler = host.hasSuffix(".pooler.supabase.com") && url.user == "postgres.\(project)"
    guard direct || pooler else { throw SetupFailure.invalidConnection }
    let query = url.queryItems ?? []
    guard query.isEmpty || (query.count == 1 && query[0].name == "sslmode" && query[0].value == "require")
    else { throw SetupFailure.invalidConnection }
    url.password = password
    url.queryItems = [URLQueryItem(name: "sslmode", value: "require")]
    guard let value = url.string else { throw SetupFailure.invalidConnection }
    return value
}

func hiddenInput(_ message: String) throws -> String {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
    // Only fixed instructional text enters the command arguments, never input.
    process.arguments = ["-e", "text returned of (display dialog \"\(message)\" default answer \"\" with hidden answer buttons {\"取消\", \"確定\"} default button \"確定\" cancel button \"取消\" with title \"StockInsider 安全設定\")"]
    let output = Pipe()
    process.standardOutput = output
    process.standardError = FileHandle.nullDevice
    try process.run()
    var data = output.fileHandleForReading.readDataToEndOfFile()
    process.waitUntilExit()
    guard process.terminationStatus == 0 else { throw SetupFailure.cancelled }
    if data.last == 10 { data.removeLast() }
    guard let text = String(data: data, encoding: .utf8), text.utf8.count <= 8192 else { throw SetupFailure.invalidPassword }
    return text
}

func store() throws {
    let identity: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "stockinsider-runtime", kSecAttrAccount as String: "database-url"]
    let found = SecItemCopyMatching(identity as CFDictionary, nil)
    guard found == errSecItemNotFound else {
        if found == errSecSuccess { throw SetupFailure.existing }
        throw SetupFailure.keychain
    }
    let template = try hiddenInput("貼上 StockInsider Connect → Session pooler 的 PostgreSQL 連線字串。密碼可保留佔位符；下一步會另行輸入。")
    let password = try hiddenInput("輸入 StockInsider 原有的資料庫密碼。只會存入此 Mac 鑰匙圈，不會重設密碼。")
    let value = try connection(template, password: password)
    var item = identity
    item[kSecValueData as String] = Data(value.utf8)
    item[kSecAttrSynchronizable as String] = false
    guard SecItemAdd(item as CFDictionary, nil) == errSecSuccess else { throw SetupFailure.keychain }
    print("database_credential_stored_connection_not_yet_verified")
}

do {
    if CommandLine.arguments == [CommandLine.arguments[0], "--self-test"] {
        let template = "postgresql://postgres.\(project):placeholder@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres"
        for password in ["test@:/?#%& space", "測試密碼", " leading and trailing "] {
            let value = try connection(template, password: password)
            precondition(URLComponents(string: value)?.password == password)
            precondition(URLComponents(string: value)?.queryItems?.first?.value == "require")
        }
        for invalid in ["https://example.com/postgres", template.replacingOccurrences(of: project, with: "wrongproject"),
                        template.replacingOccurrences(of: ":5432/", with: ":6543/"), template + "?sslmode=disable"] {
            do { _ = try connection(invalid, password: "test"); fatalError("invalid_connection_accepted") }
            catch SetupFailure.invalidConnection { }
        }
        print("credential_bootstrap_self_test_passed_no_keychain_write")
    } else if CommandLine.arguments == [CommandLine.arguments[0], "--store"] {
        try store()
    } else {
        print("usage: store-local-database-credential --self-test|--store")
        exit(2)
    }
} catch SetupFailure.cancelled { print("credential_setup_cancelled"); exit(2)
} catch SetupFailure.existing { print("credential_exists_not_overwritten"); exit(1)
} catch { print("credential_setup_failed_no_secret_output"); exit(1) }
