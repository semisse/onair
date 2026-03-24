#!/bin/bash
set -e

SRC="native/check-mic.swift"
OUT="native/check-mic"

echo "Building check-mic universal binary..."

swiftc -target arm64-apple-macosx11.0  "$SRC" -o "${OUT}-arm64"
swiftc -target x86_64-apple-macosx10.15 "$SRC" -o "${OUT}-x86_64"

lipo -create "${OUT}-arm64" "${OUT}-x86_64" -output "$OUT"
rm "${OUT}-arm64" "${OUT}-x86_64"
chmod +x "$OUT"

echo "Done: $OUT (universal)"
