#!/usr/bin/env bash
# 在本機重現 .github/workflows/ci.yml 的掃描規則，推送前先跑一次。
#
# 此工具由虎門科技資深技術工程師 Jeff Hong 洪敬傑提供
#
# 為什麼要有這支腳本：這些樣式含大量反斜線，直接貼進互動式 shell 或工具的
# 行內指令時，跳脫層數會被吃掉一層，結果是「本機顯示通過、CI 卻擋下來」。
# 樣式一律放在檔案裡用單引號保存，不要再改成行內指令。
#
# 用法（在 repo 根目錄）：bash .github/scripts/ci_scan_local.sh
set -u
export LC_ALL=C
fail=0

EXCLUDES=":(exclude).git :(exclude).github/** :(exclude,glob)**/dist/** :(exclude,glob)**/*.min.js :(exclude,glob)**/package-lock.json :(exclude,glob)**/*.lock :(exclude,glob)**/*.svg :(exclude,glob)**/*.aedt :(exclude,glob)**/*.aedtz :(exclude)AGENTS.md :(exclude)README.en.md :(exclude)README.zh-TW.md :(exclude)NOTICE.md :(exclude).gitignore"
DOCS="AGENTS.md README.en.md README.zh-TW.md NOTICE.md"

check() {  # check <名稱> <命中內容>
  if [ -n "$2" ]; then
    echo "✗ $1"
    echo "$2"
    fail=1
  else
    echo "✓ $1"
  fi
}

check "禁止追蹤檔型（.venv / node_modules / .aedb / .aedt.lock）" \
  "$(git ls-files | grep -E '(^|/)(\.venv|node_modules)/|\.aedb(/|$)|\.aedt\.lock$' || true)"

pattern='(^|[^A-Za-z])D:\\|(^|[^A-Za-z])C:\\Users|\\\\[A-Za-z0-9_.-]+\\|10\.[0-9]+\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|api[_-]?key|access[_-]?token|password|secret|private[_-]?key|license.?server|customer|private-source'
check "敏感路徑／憑證掃描" \
  "$(git grep -I -n -i -E "$pattern" -- . $EXCLUDES || true)"

pattern='(^|[^A-Za-z])[A-Za-z]:[\\/]|\\\\[A-Za-z0-9_.-]+\\'
check "豁免檔中的絕對路徑" \
  "$(git grep -I -n -E "$pattern" -- $DOCS || true)"

check "憑證形狀檔案" \
  "$(git ls-files | grep -E '(^|/)\.env(\..*)?$|\.pem$|\.key$|id_rsa' || true)"

echo
if [ "$fail" -eq 0 ]; then
  echo "全部通過。注意：圖片是二進位，任何規則都掃不到，"
  echo "截圖請自行確認沒有本機路徑、客戶名稱與 License 資訊。"
else
  echo "有規則未通過，修正後再推送。"
fi
exit "$fail"
