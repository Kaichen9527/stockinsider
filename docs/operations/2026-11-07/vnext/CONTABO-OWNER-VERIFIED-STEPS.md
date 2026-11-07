# Contabo owner 可核對步驟（2026-11-07，仍未建立連線）

核對來源：`02b4bd5995a50e0497edae5382d34733d5dbc2f9`。本文件是本機 source review 與 owner 操作邊界，**不是 owner 已完成 console 驗證的收據**。沒有連 Contabo、設定網路、產生 SSH identity、執行 bootstrap apply 或讀寫秘密／env；沒有部署、正式 DB／服務／排程變更。

## 現在可由 owner 在既有可信 Console／VNC 執行：readonly

Owner 先透過自己既有可信的 Contabo 帳戶與 Console／VNC 驗證主機。`5.104.83.211`／`vmi3152467` 是既有 host locator，尚不是 staging endpoint 或 SSH trust。以下只讀公開 host key、主機與容量事實；沒有下載或落盤：

```sh
set -eu
test "$(hostname -s)" = vmi3152467
hostname -s
hostname -I
test -f /etc/ssh/ssh_host_ed25519_key.pub
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub -E sha256
cat /etc/ssh/ssh_host_ed25519_key.pub
df -B1 -- / /srv
awk '/^MemAvailable:/ {print $1, $2, $3}' /proc/meminfo
```

只回傳 hostname／addresses、**`ssh-ed25519` 公開 host-key line 與 SHA256 fingerprint**、容量和取得時間；不讀 `/etc/ssh/ssh_host_ed25519_key`。Owner 必須以已驗證的可信渠道交付公鑰／指紋，再由接收端核對一致。不可用第一次 SSH、`ssh-keyscan`、`accept-new` 或 IP locator 自行建立 trust。

舊 [CONSOLE.md](../../2026-10-22/vnext/CONSOLE.md) 的 key 到期時間為 `2026-10-22T00:08:18Z`，不能重跑其 APPLY block 或替它延長期限。該文件的 `APPLY=0` block 仍會下載並寫入 `/tmp`；它不是本節「不落盤 readonly」指令。舊 README 的 memory-only identity 敘述是歷史紀錄，不代表本次 VM 持有有效 identity。

## 尚缺前置：現在不得執行 mutating bootstrap 或 SSH

| 必要前置 | 本次核對結果／缺件 |
| --- | --- |
| 可信 host key | `plan.json.expectedHostKeySha256=null`；沒有本次 owner console 公開 ED25519 key／指紋／可信渠道收據。 |
| 精確目的 TCP scope | 需要平台證實 **本 task → `5.104.83.211/32`，TCP destination `22` only**，含實際適用 task／runtime、有效期限及撤回方式。本次只讀 `/etc/codex/network-policy.json`：`tcp_network_access.domains=[]`、`ip_ranges=[]`；沒有此 grant。工具目錄未提供可編輯此 IP／port scope 的介面；`exec_command`／`request_permissions` 的 `network.enabled` boolean 不能證明這種 scope。HTTPS allowlist／一般網路 enabled 也不是該證據。此輪不設定、不探測網路。 |
| 新的最小權限 client identity 與 secure custody | 本次 names-only process check：`SSH_AUTH_SOCK_present=false`、socket absent；因此沒有呼叫 `ssh-add`。需要 owner／平台已批准的短效新 identity、公鑰／預期 SHA256 fingerprint、存活 socket 與私鑰安全保管／撤回機制。不能借 production identity，不能貼私鑰、寫私鑰檔或把歷史 memory key 當現存。此輪不自造 identity／grant。 |
| 有效 client expiry | Owner 批准未來 UTC expiry，bootstrap 執行當下 `0 < remaining <= 3600 秒`；agent 本身的有效期亦需另有證據。server authorized-key expiry 不等於 agent key 會自動移除。 |
| 已審 source／host policy／容量與無衝突 namespace | Owner 確認 exact bootstrap hash、支援 `restrict`／`expiry-time` 的實際 sshd、account policy、root console、容量、account／group／root path／gateway 全不存在。歷史 OpenSSH9.2 container 收據不證明 Contabo 實際 policy。 |
| 撤回與事故處理 | 現有 bootstrap／verify **沒有 revoke、rollback 或 cleanup helper**。Owner 尚需審核精確 key／account 的撤回、現存 session 處理、部分失敗保留與資源歸屬程序；不以 generic `userdel`／`rm`／重跑 bootstrap 代替。 |
| verifier 與隔離計畫 | `sshAlias`、`expectedHostName`、`expectedHostKeySha256`、`writerRelease` 皆 null。writerRelease 必須是實際隔離 writer identity，不能拿 commit SHA 或 dummy 值充數。隔離 app／DB／queue／storage／network namespace、fixture-only 與 disabled schedules 尚未驗證。 |

任何一項缺失即停在 readonly facts；本文件沒有授權 apply、SSH 或 production 操作。不得改走 443／HTTP CONNECT／tunnel／VPN，或降低容量／host trust 條件。

Root 本輪讀到的 environment-status：environment `ccarenv_b64_Y2NhcmVudl82ODU0YWE3YmQ3MjA4MTkxYjJiNTQxYTc1M2NkOTM3Zg`、`observations_current=true`、observed phase `running`、network state `enforced`、`secrets=[]`、`outbound_identities=[]`。這是目前 metadata，不是 SSH secure custody 或 transport readiness 證據；舊 OWNER-ACTIONS 中的 original VM environment ID 不能當成本輪相同 runtime。

## 已核對的 bootstrap 介面與實際限制（未執行 apply）

來源：[`bootstrap.py`](../../../../deployment/staging/vnext/bootstrap.py)。支援的參數只有 `--help`、`--apply`、`--public-key-file`、`--expires-utc`。**預設就是 dry-run，沒有 `--dry-run` 或 `--revoke` 參數**。

Owner 已持有經 hash 核對的本機 script 後，以下預設模式只讀 `/srv` statvfs 與 `/proc/meminfo`，回傳 JSON；不創建 account／directory、不讀 public-key-file，也不驗證 namespace 已不存在。它只能證明該 host 當下容量：

```sh
python3 -I "$OWNER_REVIEWED_BOOTSTRAP"
```

未來在所有前置與獨立授權齊備後，apply 的**實際參數語法**才是：

```sh
# 禁止現在執行；以下變數尚未取得 owner-approved 綁定。
python3 -I "$OWNER_REVIEWED_BOOTSTRAP" --apply \
  --public-key-file "$OWNER_APPROVED_CLIENT_PUBLIC_KEY_FILE" \
  --expires-utc "$OWNER_APPROVED_EXPIRY_UTC"
```

Apply 必須 root 且容量合格；接受不大於4096 bytes、非 symlink 的單行 Ed25519 public-key file，以及至多一小時的未來 expiry。它拒絕已存在的 `si-vnext-oct22` user／group、`/srv/stockinsider-vnext-oct22-staging` 或 `/usr/local/libexec/stockinsider-vnext-oct22-staging-gateway`。拒絕 overwrite，但 mutation 不是 transaction，失敗後沒有自動 rollback／安全重試。

它只建立上述 account、empty namespace、root-owned gateway；authorized_keys 是 root:new-group `0640`，home／`.ssh` 是 root:new-group `0750`。公鑰選項為 `restrict,expiry-time="<UTC>",command="<gateway>"`：限制 PTY、agent／X11／port forwarding 與 user-rc，gateway 僅接受完全相等的 `vnext-preflight-v1`，任意／compound command 與 SFTP 被拒。沒有 sudo／docker group 權限。為避免鎖定帳號，程式會產生不保留的隨機密碼、以 stdin 設定其 hash；這是 **apply 的 account mutation**，不是本次執行，也不是 private SSH key generation。實際 sshd／PAM／密碼登入策略仍需 owner 驗證。

`expiry-time` 限制到期後的 key authentication，**不會自動刪帳號、移除 agent key 或中止已建立 session**。Gateway JSON 僅涵蓋 namespace、nonroot uid、容量、storage owner 與 `NOT_PROVISIONED` app／DB；沒有 install app／DB 或正式 deployment authority。

容量沿用原值：available disk 減1GiB WAL、0.5GiB temp、128MiB deploy、2GiB growth 後仍須保留15GiB；available memory 減1GiB peak 後保留1.5GiB。不得因 dry-run 通過推論完整 staging 已隔離。

## 本機 dry-run 與未來 strict SSH 的界線

本輪已執行的安全本機命令（無 child SSH／網路）：

```sh
node --test scripts/vnext-staging-preflight.test.mjs
node deployment/staging/vnext/verify.mjs
python3 -I deployment/staging/vnext/bootstrap.py --help
```

結果：preflight tests **3 PASS / 0 FAIL**；verifier `DRY_RUN` exit **2**，列出 `account_owner_ssh_alias_required`、`account_owner_host_name_required`、`trusted_host_key_fingerprint_required`、`isolated_candidate_writer_identity_required`，`agentSocketPresent=false`、`provisioned=false`、`stagingAcceptance=NOT_RUN`。`bootstrap --help` exit0。沒有在這台非 Contabo VM 執行 bootstrap capacity dry-run，以免把 VM 容量當成 Contabo 證據。

現有 [`verify.mjs`](../../../../deployment/staging/vnext/verify.mjs) 只接受 `--plan <path>` 和 `--verify-read-only`。以下是**未來有連線行為、現在禁止執行**的既有入口：

```sh
node deployment/staging/vnext/verify.mjs \
  --plan "$OWNER_REVIEWED_COMPLETE_PLAN" --verify-read-only
```

該分支會執行 `ssh-add -l`、`ssh -G <alias>`、`ssh-keygen -F <expectedHostName>`、`ssh-keygen -lf -`，再 SSH `vnext-preflight-v1`。它要求預先 trusted known_hosts fingerprint 相符，使用 `BatchMode=yes`、`StrictHostKeyChecking=yes`、`ConnectTimeout=10`；即使 readonly 成功也 exit2，isolation proof 保持 PENDING。

但程式僅檢查 agent 非空，**未比較 owner-approved client fingerprint**；未鎖定 alias 的 user／port／IdentityFile／IdentityAgent，亦未直接指定 `-T`、禁 forwarding、禁 ProxyCommand／ProxyJump／既有 multiplex session、ED25519-only 或專用 known_hosts。它依賴本機 ssh config／defaults，且會內部讀 `ssh -G`；本次沒有 dump config。**執行該入口前必須完整審核公開 SSH config 及其 Include／Match、已驗證 known_hosts、effective alias 與 identity 選擇**，確認 user／22／public-key-only／no PTY／no forwarding／no proxy／no multiplex 等 scope。未審或不能安全分離公開 config 時不執行。不能僅因執行該入口就宣稱已具完整 client scope。現有3個 tests只覆蓋 plan／capacity，沒有驗證其 live SSH branch。

若未來 owner 完成全部前置並批准一次 readonly probe，下列**待審範本**直接固定 TCP22／nonroot user／client public-key selector／ED25519 trust，避免未知 alias config；此輪未執行。`VNEXT_TRUSTED_KNOWN_HOSTS` 必須是 owner 公開 key 經可信渠道核對後的專用檔，恰有 `5.104.83.211 ssh-ed25519 <trusted-public-blob>` 一筆；`VNEXT_CLIENT_PUBLIC_KEY` 是批准 identity 的 **public-only** file，對應私鑰留在已批准的 agent，兩者 fingerprint 須一致。先由 owner 只核對公開資訊：

```sh
# 所有檔案均為 owner 經可信渠道建立的公開資料；不是本輪建立。
ssh-keygen -F 5.104.83.211 -f "$VNEXT_TRUSTED_KNOWN_HOSTS"
ssh-keygen -lf "$VNEXT_TRUSTED_KNOWN_HOSTS" -E sha256
ssh-keygen -lf "$VNEXT_CLIENT_PUBLIC_KEY" -E sha256
ssh-add -l -E sha256
```

下列命令也必須在 owner 核對到期時間與 key／socket、平台精確目的 scope、server forced-command 後才可獨立授權執行；任何 mismatch 都停，不重試或 accept-new：

```sh
# 禁止現在執行：目前沒有 host trust、identity custody、TCP scope 或 bootstrap receipt。
ssh -F /dev/null -T -n -p 22 -l si-vnext-oct22 \
  -o BatchMode=yes -o ConnectTimeout=10 -o ConnectionAttempts=1 \
  -o StrictHostKeyChecking=yes -o HostKeyAlgorithms=ssh-ed25519 \
  -o UserKnownHostsFile="$VNEXT_TRUSTED_KNOWN_HOSTS" \
  -o GlobalKnownHostsFile=/dev/null -o UpdateHostKeys=no -o VerifyHostKeyDNS=no \
  -o IdentityAgent="$SSH_AUTH_SOCK" -o IdentityFile="$VNEXT_CLIENT_PUBLIC_KEY" \
  -o IdentitiesOnly=yes -o PreferredAuthentications=publickey \
  -o PasswordAuthentication=no -o KbdInteractiveAuthentication=no \
  -o ForwardAgent=no -o ForwardX11=no -o ForwardX11Trusted=no \
  -o ClearAllForwardings=yes -o Tunnel=no -o RequestTTY=no \
  -o PermitLocalCommand=no -o ProxyCommand=none -o ProxyJump=none \
  -o ControlMaster=no -o ControlPath=none -o ControlPersist=no \
  5.104.83.211 vnext-preflight-v1
```

本範本未驗證實際 Contabo OpenSSH compatibility／有效 policy，也不處理 app staging acceptance。真正隔離仍需獨立 app network namespace 中 REST3302 對應 staging host34223；不能指到正式 host3302。Ports34222／34223／34224、fixture-only、disabled schedules、獨立 DB／writer／queue／storage 均保留原 guard。

## Source 與驗證摘要

所有雜湊是本次 checkout 的 SHA256；沒有用它們補造 host key 或 client identity。

| Source | SHA256 |
| --- | --- |
| `deployment/staging/vnext/README.md` | `f32569ee84b924a209bf798171d771d5bc787e38217a12b2211ae4a7de8fa0a0` |
| `deployment/staging/vnext/plan.json` | `2417b68c4def81467284ed1714a81df99e22e109a08157b46ff2ef19f13f4f4f` |
| `deployment/staging/vnext/bootstrap.py` | `564a76c835e3504af52764e1a9bc5b3d546a815a38c677c5384d6de14543a902` |
| `deployment/staging/vnext/verify.mjs` | `28ec5a44328145a6e2c33f996d241b02b7fe5029540cc645e7a8d685fadef050` |
| `scripts/vnext-staging-preflight.test.mjs` | `4813df80860747f8f822a86a629fbba66d64c03971877dca84391554b8072c17` |
| `docs/operations/2026-10-22/vnext/OWNER-ACTIONS.md` | `6db9018eeb93856dec6b65d17d88bfc5babd27038fa261deb0b4e99156bf6254` |
| `docs/operations/2026-10-22/vnext/CONSOLE.md` | `748c8b5527c7596a382e10571973fdde2b54c5468965fb5445c1d689d5ddf989` |
| `docs/operations/2026-10-22/vnext/ssh-isolation-receipt.json` | `2f2a8ea9d17044f7620cd21d0c7817872eab239417fb89bcb8667b59fd1018c7` |

歷史 receipt 為本地 container 八項 SSH checks；`hostKeyScope=owned container only, not Contabo trust`。本次只重跑 source／plan／capacity tests，沒有重跑 container／SSH tests，沒有讀其中列出的 private evidence。文件變更不涉及應用程式碼，因此未執行 web build；沒有 commit／push。

## Updated operator facts and this executor admission — subsequent checkpoint

Owner reports a strict previously pinned login to vmi3152467/5.104.83.211 and a public ED25519 fingerprint matching its existing trust record: `SHA256:yQ4VCXl76rLr6Zep0ybQcHZeK4CfuFmMiZcWJrp2DYg`. The supplied public key was locally decoded and its fingerprint matches; no remote probe or known_hosts modification occurred. Owner reports exact47a9bda bootstrap readonly dry-run capacityReady=true/projectedDisk25371435008/projectedMemory2914750464/productionActions0; no staging account/key installed. This is operator-attested host evidence with no supplied observation timestamp, not a new capacity measurement or transport/isolation/restore proof by this Cloud VM. No action is taken on the reported ubuntu OpenClaw gateway or any existing service.

Latest same-executor names-only evidence still has no SSH_AUTH_SOCK variable/socket, ready secrets/outbound identities or observed supported exact TCP22 grant. Startup TCP domains/ip_ranges are empty; live environment status is current/running/enforced but supplies no exact raw-TCP route identity. This does not infer a live TCP rule from HTTP policy. No SSH attempt, raw-TCP probe, key generation, network configuration or Contabo mutation is performed. See [readiness receipt](SSH-READINESS-RECEIPT.json).

Official supported entry for reusable environment configuration remains **Settings → Codex Cloud → Environments → this environment → Edit**, as documented in [Cloud Environments](https://learn.chatgpt.com/docs/environments/cloud-environments). This is not evidence of an available raw-IP/port editor. The available tool catalog exposes status but no scoped request_changes/draft/TCP grant writer. Do not substitute network.enabled=true or an HTTPS allowlist. Ask the platform/environment administrator or official support for a supported task-scoped route: this exact environment ID →5.104.83.211/32 destinationTCP22 only, with observed activation/expiry/revocation and a preservation-safe current-task mechanism. Preserve this workspace; Save/Publish alone does not prove a running task changed.

In parallel the platform/owner must establish secure custody for a short-lived staging-only SSH agent identity (not a production identity), its approved public fingerprint, matching live socket, <=1hour server expiry and precise revocation/session handling. No identity is generated while the route/custody is unresolved. Once the supported route and agent are genuinely ready, refresh same-executor status and verify public identity metadata before preparing only public-key/expiry receipts for owner review. The existing bootstrap/strict readonly command syntax above is conditional; host capacity alone does not authorize it.
