#!/usr/bin/env bash
# 在本機重現 .github/workflows/ci.yml 的掃描規則，推送前先跑一次。
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

# 樣式提前具名，讓 --selftest 與正式掃描共用同一份定義。
# 兩邊各寫一次的話，改了一邊忘了另一邊，自我測試就會對著舊樣式說「通過」。
PATTERN_SENSITIVE='(^|[^A-Za-z])D:\\|(^|[^A-Za-z])C:\\Users|\\\\[A-Za-z0-9_.-]+\\|10\.[0-9]+\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|api[_-]?key|access[_-]?token|password|secret|private[_-]?key|license.?server|customer|private-source'
PATTERN_DOCPATH='(^|[^A-Za-z])[A-Za-z]:[\\/]|\\\\[A-Za-z0-9_.-]+\\'

# ── 自我測試：確認規則本身還會叫 ────────────────────────────────
# 為什麼需要：規則被改壞、或被人「順手簡化」之後靜靜地永遠不命中，是最
# 危險的失效方式——看起來像乾淨，其實沒在檢查。實際踩過：一度以為 UNC
# 規則失效而差點去改一個沒壞的樣式，追下去發現是**測試檔**少了一層反斜線。
# 樣本檔放在 .github/ 底下（掃描範圍已排除），所以放這些字串不會讓正式
# 掃描失敗。
if [ "${1:-}" = "--selftest" ]; then
  FIXTURE=".github/scripts/selftest_fixture.txt"
  [ -f "$FIXTURE" ] || { echo "找不到樣本檔 $FIXTURE"; exit 1; }
  bad=0
  echo "── 規則自我測試 ──"
  positive=$(sed -n '1,/^NEGATIVE$/p' "$FIXTURE")
  negative=$(sed -n '/^NEGATIVE$/,$p' "$FIXTURE" | tail -n +2)
  for spec in "敏感路徑／憑證掃描|$PATTERN_SENSITIVE" "豁免檔中的絕對路徑|$PATTERN_DOCPATH"; do
    label="${spec%%|*}"; pat="${spec#*|}"
    if printf '%s\n' "$positive" | grep -qiE "$pat"; then
      echo "✓ $label 會叫"
    else
      echo "✗ $label **不會叫**——規則壞了，或樣本檔被改過"
      bad=1
    fi
    if printf '%s\n' "$negative" | grep -qiE "$pat"; then
      echo "✗ $label 誤判了反例"
      bad=1
    fi
  done
  [ "$bad" -eq 0 ] && echo "自我測試通過。" || echo "自我測試失敗。"
  exit "$bad"
fi

check "禁止追蹤檔型（.venv / node_modules / .aedb / .aedt.lock）" \
  "$(git ls-files | grep -E '(^|/)(\.venv|node_modules)/|\.aedb(/|$)|\.aedt\.lock$' || true)"

check "敏感路徑／憑證掃描" \
  "$(git grep -I -n -i -E "$PATTERN_SENSITIVE" -- . $EXCLUDES || true)"

check "豁免檔中的絕對路徑" \
  "$(git grep -I -n -E "$PATTERN_DOCPATH" -- $DOCS || true)"

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
