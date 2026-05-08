#!/bin/bash
echo "========================================="
echo "  CLAUDE CODE DIAGNOSTIC REPORT"
echo "========================================="
echo ""

echo "--- 1. Node.js version ---"
node --version 2>&1 || echo "❌ Node.js không tìm thấy"

echo ""
echo "--- 2. npm version ---"
npm --version 2>&1 || echo "❌ npm không tìm thấy"

echo ""
echo "--- 3. Claude Code version ---"
claude --version 2>&1 || echo "❌ claude không tìm thấy trong PATH"

echo ""
echo "--- 4. Claude Code location ---"
which claude 2>&1 || echo "❌ claude không có trong PATH"

echo ""
echo "--- 5. Claude Code package info ---"
npm list -g @anthropic-ai/claude-code 2>&1 | head -5

echo ""
echo "--- 6. ~/.claude directory ---"
ls -la ~/.claude/ 2>&1 | head -20

echo ""
echo "--- 7. ~/.claude/settings.json ---"
cat ~/.claude/settings.json 2>&1 || echo "(không có file)"

echo ""
echo "--- 8. PATH ---"
echo $PATH

echo ""
echo "--- 9. Thử chạy claude với verbose ---"
claude --version --verbose 2>&1 | head -20

echo ""
echo "========================================="
echo "  DONE - Đóng cửa sổ này để thoát"
echo "========================================="
read -p "Nhấn Enter để đóng..."
