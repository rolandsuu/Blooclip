NotoSansCJKsc-Regular.otf is bundled for FFmpeg/libass subtitle rendering.

Chinese subtitles need a font with Simplified Chinese glyph coverage in the
worker runtime. Without this file, libass can render missing glyph boxes even
when the subtitle text is correct.

Source: https://github.com/googlefonts/noto-cjk
License: SIL Open Font License 1.1, included in NotoSansCJK-LICENSE.txt.
