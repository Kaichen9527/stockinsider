// Device-local key escrow. --read emits binary only to a caller-owned pipe;
// never invoke --read directly from a terminal or surface its output in logs.
import Foundation
import Security

let identity: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: "stockinsider-local-backup", kSecAttrAccount as String: "aes256-v1"]
do {
    guard CommandLine.arguments.count == 2, ["--ensure", "--read"].contains(CommandLine.arguments[1]) else {
        throw NSError(domain: "arguments", code: 1)
    }
    var query = identity
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var found: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &found)
    var key: Data
    if status == errSecSuccess, let existing = found as? Data, existing.count == 32 {
        key = existing
    } else if status == errSecItemNotFound && CommandLine.arguments[1] == "--ensure" {
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else {
            throw NSError(domain: "random", code: 1)
        }
        key = Data(bytes)
        _ = bytes.withUnsafeMutableBytes { $0.initializeMemory(as: UInt8.self, repeating: 0) }
        var item = identity
        item[kSecValueData as String] = key
        item[kSecAttrSynchronizable as String] = false
        let storeStatus = SecItemAdd(item as CFDictionary, nil)
        guard storeStatus == errSecSuccess else {
            throw NSError(domain: "store", code: Int(storeStatus))
        }
    } else { throw NSError(domain: "keychain", code: Int(status)) }
    defer { key.resetBytes(in: 0..<key.count) }
    if CommandLine.arguments[1] == "--read" {
        guard isatty(STDOUT_FILENO) == 0 else { throw NSError(domain: "tty", code: 1) }
        FileHandle.standardOutput.write(key)
    } else { print("local_backup_key_available_not_independently_escrowed") }
} catch {
    let diagnostic = error as NSError
    FileHandle.standardError.write(Data("local_backup_key_operation_failed status=\(diagnostic.code)\n".utf8))
    exit(1)
}
