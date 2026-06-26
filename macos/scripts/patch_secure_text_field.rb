#!/usr/bin/env ruby

# AppKit (macOS 12+) requires NSSecureTextFieldCell's field editor delegate to be an
# NSSecureTextField. react-native-macos defines RCTUISecureTextField as a subclass of
# RCTUITextField (NSTextField) with an NSSecureTextFieldCell, which triggers:
#   NSSecureTextFieldCell is not secure because the secure field editor's delegate must be an NSSecureTextField
#
# Fix: compile RCTUITextField's implementation a second time with RCTUISecureTextField inheriting
# from NSSecureTextField (the approach from react-native-macos PR #612).

PATCH_MARKER = 'GUMP_SECURE_TEXT_FIELD_PATCH_V3'
FOCUS_RING_PATCH_MARKER = 'GUMP_SECURE_TEXT_FIELD_FOCUS_RING_PATCH'

def rn_macos_root
  File.expand_path('../../node_modules/react-native-macos', __dir__)
end

def read_file(path)
  return nil unless File.exist?(path)

  File.read(path)
end

def write_patch(path, contents)
  File.write(path, contents)
  puts "[macos] Patched #{path} (#{PATCH_MARKER})"
end

def cell_cast_macro
  <<~MACRO
    #if defined(RCT_SUBCLASS_SECURETEXTFIELD) && RCT_SUBCLASS_SECURETEXTFIELD
    #define RCTUI_TEXT_FIELD_CELL(cell) ((RCTUISecureTextFieldCell *)(cell))
    #else // RCT_SUBCLASS_SECURETEXTFIELD
    #define RCTUI_TEXT_FIELD_CELL(cell) ((RCTUITextFieldCell *)(cell))
    #endif // RCT_SUBCLASS_SECURETEXTFIELD

  MACRO
end

def secure_text_field_header_contents
  <<~HEADER
    /*
     * Copyright (c) Facebook, Inc. and its affiliates.
     *
     * This source code is licensed under the MIT license found in the
     * LICENSE file in the root directory of this source tree.
     */

    // [macOS] #{PATCH_MARKER}

    #if TARGET_OS_OSX

    #import <React/RCTUIKit.h>
    #import <React/RCTBackedTextInputViewProtocol.h>

    @interface RCTUISecureTextField : NSSecureTextField <RCTBackedTextInputViewProtocol>
    @end

    #endif
  HEADER
end

def secure_text_field_impl_contents
  <<~IMPL
    /*
     * Copyright (c) Facebook, Inc. and its affiliates.
     *
     * This source code is licensed under the MIT license found in the
     * LICENSE file in the root directory of this source tree.
     */

    // [macOS] #{PATCH_MARKER}

    #if TARGET_OS_OSX

    #define RCT_SUBCLASS_SECURETEXTFIELD 1
    #import "../RCTUITextField.mm"

    #endif // TARGET_OS_OSX
  IMPL
end

text_field_header = File.join(
  rn_macos_root,
  'Libraries/Text/TextInput/Singleline/RCTUITextField.h'
)
text_field_impl = File.join(
  rn_macos_root,
  'Libraries/Text/TextInput/Singleline/RCTUITextField.mm'
)
secure_text_field_header = File.join(
  rn_macos_root,
  'Libraries/Text/TextInput/Singleline/macOS/RCTUISecureTextField.h'
)
secure_text_field_impl = File.join(
  rn_macos_root,
  'Libraries/Text/TextInput/Singleline/macOS/RCTUISecureTextField.mm'
)

unless read_file(text_field_header)
  puts '[macos] react-native-macos TextInput sources not found, skipping secure text field patch'
  exit 0
end

changed = false

# --- RCTUITextField.h ---
header_contents = read_file(text_field_header)
if header_contents.include?(PATCH_MARKER)
  puts '[macos] RCTUITextField.h already patched for secure text entry'
elsif header_contents.include?('GUMP_SECURE_TEXT_FIELD_PATCH_V2')
  header_contents = header_contents.gsub('GUMP_SECURE_TEXT_FIELD_PATCH_V2', PATCH_MARKER)
  write_patch(text_field_header, header_contents)
  changed = true
else
  patched = header_contents.sub(
    "#else // [macOS\n@interface RCTUITextField : NSTextField <RCTBackedTextInputViewProtocol>\n#endif // macOS]",
    <<~PATCH.chomp
      #else // [macOS
      #if defined(RCT_SUBCLASS_SECURETEXTFIELD) && RCT_SUBCLASS_SECURETEXTFIELD // #{PATCH_MARKER}
      @interface RCTUISecureTextField : NSSecureTextField <RCTBackedTextInputViewProtocol>
      #else // RCT_SUBCLASS_SECURETEXTFIELD
      @interface RCTUITextField : NSTextField <RCTBackedTextInputViewProtocol>
      #endif // RCT_SUBCLASS_SECURETEXTFIELD
      #endif // macOS]
    PATCH
  )

  if patched == header_contents
    warn '[macos] RCTUITextField.h did not match expected secure text field patch targets'
    exit 1
  end

  write_patch(text_field_header, patched)
  changed = true
end

# --- RCTUITextField.mm ---
impl_contents = read_file(text_field_impl)
if impl_contents.include?(PATCH_MARKER) && impl_contents.include?('RCTUI_TEXT_FIELD_CELL(cell)')
  puts '[macos] RCTUITextField.mm already patched for secure text entry'
elsif impl_contents.include?('GUMP_SECURE_TEXT_FIELD_PATCH_V2') || !impl_contents.include?(PATCH_MARKER)
  patched = impl_contents
  unless patched.include?('GUMP_SECURE_TEXT_FIELD_PATCH')
    patched = patched
      .sub(
        "@interface RCTUITextFieldCell : NSTextFieldCell\n",
        <<~PATCH
          #if defined(RCT_SUBCLASS_SECURETEXTFIELD) && RCT_SUBCLASS_SECURETEXTFIELD // #{PATCH_MARKER}
          @interface RCTUISecureTextFieldCell : NSSecureTextFieldCell
          #else // RCT_SUBCLASS_SECURETEXTFIELD
          @interface RCTUITextFieldCell : NSTextFieldCell
          #endif // RCT_SUBCLASS_SECURETEXTFIELD

        PATCH
      )
      .sub(
        "@implementation RCTUITextFieldCell\n",
        <<~PATCH
          #if defined(RCT_SUBCLASS_SECURETEXTFIELD) && RCT_SUBCLASS_SECURETEXTFIELD
          @implementation RCTUISecureTextFieldCell
          #else // RCT_SUBCLASS_SECURETEXTFIELD
          @implementation RCTUITextFieldCell
          #endif // RCT_SUBCLASS_SECURETEXTFIELD

        PATCH
      )
      .sub(
        "  [super editWithFrame:[self titleRectForBounds:rect] inView:controlView editor:textObj delegate:delegate event:event];\n",
        <<~PATCH
          #if defined(RCT_SUBCLASS_SECURETEXTFIELD) && RCT_SUBCLASS_SECURETEXTFIELD
            [super editWithFrame:[self titleRectForBounds:rect] inView:controlView editor:textObj delegate:controlView event:event];
          #else // RCT_SUBCLASS_SECURETEXTFIELD
            [super editWithFrame:[self titleRectForBounds:rect] inView:controlView editor:textObj delegate:delegate event:event];
          #endif // RCT_SUBCLASS_SECURETEXTFIELD

        PATCH
      )
      .sub(
        "  [super selectWithFrame:[self titleRectForBounds:rect] inView:controlView editor:textObj delegate:delegate start:selStart length:selLength];\n",
        <<~PATCH
          #if defined(RCT_SUBCLASS_SECURETEXTFIELD) && RCT_SUBCLASS_SECURETEXTFIELD
            [super selectWithFrame:[self titleRectForBounds:rect] inView:controlView editor:textObj delegate:controlView start:selStart length:selLength];
          #else // RCT_SUBCLASS_SECURETEXTFIELD
            [super selectWithFrame:[self titleRectForBounds:rect] inView:controlView editor:textObj delegate:delegate start:selStart length:selLength];
          #endif // RCT_SUBCLASS_SECURETEXTFIELD

        PATCH
      )
      .sub(
        "@implementation RCTUITextField {",
        <<~PATCH.chomp
          #if defined(RCT_SUBCLASS_SECURETEXTFIELD) && RCT_SUBCLASS_SECURETEXTFIELD
          @implementation RCTUISecureTextField {
          #else // RCT_SUBCLASS_SECURETEXTFIELD
          @implementation RCTUITextField {
          #endif // RCT_SUBCLASS_SECURETEXTFIELD
        PATCH
      )
      .sub(
        "  return RCTUITextFieldCell.class;\n",
        <<~PATCH
          #if defined(RCT_SUBCLASS_SECURETEXTFIELD) && RCT_SUBCLASS_SECURETEXTFIELD
            return RCTUISecureTextFieldCell.class;
          #else // RCT_SUBCLASS_SECURETEXTFIELD
            return RCTUITextFieldCell.class;
          #endif // RCT_SUBCLASS_SECURETEXTFIELD

        PATCH
      )
  end

  patched = patched.gsub('GUMP_SECURE_TEXT_FIELD_PATCH_V2', PATCH_MARKER)
  patched = patched.gsub('((id)self.cell)', 'RCTUI_TEXT_FIELD_CELL(self.cell)')
  patched = patched.gsub('((RCTUITextFieldCell*)self.cell)', 'RCTUI_TEXT_FIELD_CELL(self.cell)')

  unless patched.include?('RCTUI_TEXT_FIELD_CELL(cell)')
    patched = patched.sub(
      "@end\n#endif // macOS]\n\n#if defined(RCT_SUBCLASS_SECURETEXTFIELD)",
      "@end\n#{cell_cast_macro}#endif // macOS]\n\n#if defined(RCT_SUBCLASS_SECURETEXTFIELD)"
    )
  end

  if patched == impl_contents
    warn '[macos] RCTUITextField.mm did not match expected secure text field patch targets'
    exit 1
  end

  write_patch(text_field_impl, patched)
  changed = true
else
  puts '[macos] RCTUITextField.mm already patched for secure text entry'
end

# --- RCTUISecureTextField.h ---
current_secure_header = read_file(secure_text_field_header)
if current_secure_header&.include?(PATCH_MARKER) &&
   current_secure_header.include?('@interface RCTUISecureTextField : NSSecureTextField')
  puts '[macos] RCTUISecureTextField.h already patched for secure text entry'
else
  write_patch(secure_text_field_header, secure_text_field_header_contents)
  changed = true
end

# --- RCTUISecureTextField.mm ---
current_secure_impl = read_file(secure_text_field_impl)
if current_secure_impl&.include?(PATCH_MARKER)
  if current_secure_impl.include?('GUMP_SECURE_TEXT_FIELD_PATCH_V2')
    write_patch(secure_text_field_impl, secure_text_field_impl_contents)
    changed = true
  else
    puts '[macos] RCTUISecureTextField.mm already patched for secure text entry'
  end
else
  write_patch(secure_text_field_impl, secure_text_field_impl_contents)
  changed = true
end

# --- RCTSinglelineTextInputView.mm: preserve enableFocusRing after secure-field swap ---
singleline_view = File.join(
  rn_macos_root,
  'Libraries/Text/TextInput/Singleline/RCTSinglelineTextInputView.mm'
)
singleline_contents = read_file(singleline_view)

if singleline_contents.nil?
  warn '[macos] RCTSinglelineTextInputView.mm not found, skipping focus ring patch'
elsif singleline_contents.include?(FOCUS_RING_PATCH_MARKER)
  puts '[macos] RCTSinglelineTextInputView.mm already patched for secure text field focus ring'
else
  focus_ring_swap_patch = [
    '    _backedTextInputView.text = previousTextField.text;',
    '    // [GUMP_SECURE_TEXT_FIELD_FOCUS_RING_PATCH] NSSecureTextField defaults to a rectangular system focus ring.',
    '    if ([_backedTextInputView respondsToSelector:@selector(setEnableFocusRing:)]) {',
    '      [_backedTextInputView setEnableFocusRing:self.enableFocusRing];',
    '    }',
    '    [self replaceSubview:previousTextField with:_backedTextInputView];',
  ].join("\n")

  patched = singleline_contents.sub(
    "    _backedTextInputView.text = previousTextField.text;\n    [self replaceSubview:previousTextField with:_backedTextInputView];",
    focus_ring_swap_patch
  )

  if patched == singleline_contents
    warn '[macos] RCTSinglelineTextInputView.mm did not match expected focus ring patch targets'
    exit 1
  end

  write_patch(singleline_view, patched)
  changed = true
end

# --- RCTUITextField.mm: disable system focus ring on NSSecureTextField by default ---
text_field_impl_for_focus_ring = read_file(text_field_impl)

if text_field_impl_for_focus_ring.nil?
  warn '[macos] RCTUITextField.mm not found, skipping focus ring patch'
elsif text_field_impl_for_focus_ring.include?(FOCUS_RING_PATCH_MARKER)
  puts '[macos] RCTUITextField.mm already patched for secure text field focus ring'
else
  patched = text_field_impl_for_focus_ring.sub(
    "    [self setBordered:NO];\n    [self setAllowsEditingTextAttributes:YES];",
    <<~PATCH.chomp
          [self setBordered:NO];
      #if defined(RCT_SUBCLASS_SECURETEXTFIELD) && RCT_SUBCLASS_SECURETEXTFIELD // #{FOCUS_RING_PATCH_MARKER}
          [self setFocusRingType:NSFocusRingTypeNone];
      #endif // RCT_SUBCLASS_SECURETEXTFIELD
          [self setAllowsEditingTextAttributes:YES];
    PATCH
  )

  if patched == text_field_impl_for_focus_ring
    warn '[macos] RCTUITextField.mm did not match expected focus ring patch targets'
    exit 1
  end

  write_patch(text_field_impl, patched)
  changed = true
end

puts '[macos] Secure text field patch up to date' unless changed
