#!/bin/bash
set -e

build_universal() {
  local SRC="$1"
  local OUT="$2"
  local FLAGS="${3:-}"
  echo "Building $(basename $OUT) universal binary..."
  swiftc -target arm64-apple-macosx11.0  $FLAGS "$SRC" -o "${OUT}-arm64"
  swiftc -target x86_64-apple-macosx10.15 $FLAGS "$SRC" -o "${OUT}-x86_64"
  lipo -create "${OUT}-arm64" "${OUT}-x86_64" -output "$OUT"
  rm "${OUT}-arm64" "${OUT}-x86_64"
  chmod +x "$OUT"
  echo "Done: $OUT (universal)"
}

build_universal "native/check-mic.swift" "native/check-mic"
build_universal "native/ble-bridge.swift" "native/ble-bridge" "-framework CoreBluetooth"
