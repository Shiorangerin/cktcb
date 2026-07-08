#!/usr/bin/env bash
# build.sh — 重新生成 js/data.js
# 用法：./build.sh
set -e
cd "$(dirname "$0")"
node scripts/build.js
