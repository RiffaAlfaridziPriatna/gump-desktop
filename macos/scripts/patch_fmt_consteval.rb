#!/usr/bin/env ruby
# frozen_string_literal: true

# fmt 11.0.2 enables consteval on Apple Clang >= 14, but Xcode 16.3+/26
# rejects those format-string checks again. Disable consteval on all Apple
# Clang builds so RCT-Folly/fmt keep compiling.

require 'pathname'

pods_root = Pathname.new(__dir__).parent.join('Pods')
fmt_base = pods_root.join('fmt', 'include', 'fmt', 'base.h')

unless fmt_base.exist?
  warn "[macos] fmt base.h not found at #{fmt_base}; skip consteval patch"
  exit 0
end

contents = fmt_base.read
old = <<~'CPP'.rstrip
  #elif defined(__apple_build_version__) && __apple_build_version__ < 14000029L
  #  define FMT_USE_CONSTEVAL 0  // consteval is broken in Apple clang < 14.
CPP
replacement = <<~'CPP'.rstrip
  #elif defined(__apple_build_version__)
  #  define FMT_USE_CONSTEVAL 0  // broken in Apple clang <14 and again in Xcode 16.3+/26
CPP

if contents.include?(replacement)
  puts '[macos] fmt consteval patch already applied'
  exit 0
end

unless contents.include?(old)
  warn '[macos] fmt base.h does not match expected Apple clang consteval guard; skip'
  exit 0
end

fmt_base.chmod(0o644) if fmt_base.exist? && !fmt_base.writable?
fmt_base.write(contents.sub(old, replacement))
puts "[macos] Patched #{fmt_base} to disable FMT_USE_CONSTEVAL on Apple Clang"
