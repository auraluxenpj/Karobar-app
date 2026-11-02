<?php

namespace App\Support;

class UrduPdfTextShaper
{
    /**
     * Glyph map for Arabic & Urdu letters:
     * Codepoint (hex) => [Isolated, Final, Initial, Medial, canJoinLeft (joins to next letter)]
     */
    private const GLYPH_MAP = [
        // Non-joining
        0x0621 => [0xFE80, 0xFE80, 0xFE80, 0xFE80, false], // ء Hamza

        // Right-joining only (canJoinLeft = false)
        0x0622 => [0xFE81, 0xFE82, 0xFE81, 0xFE82, false], // آ Alef Madda
        0x0623 => [0xFE83, 0xFE84, 0xFE83, 0xFE84, false], // أ Alef Hamza Above
        0x0624 => [0xFE85, 0xFE86, 0xFE85, 0xFE86, false], // ؤ Waw Hamza
        0x0625 => [0xFE87, 0xFE88, 0xFE87, 0xFE88, false], // إ Alef Hamza Below
        0x0627 => [0xFE8D, 0xFE8E, 0xFE8D, 0xFE8E, false], // ا Alef
        0x0629 => [0xFE93, 0xFE94, 0xFE93, 0xFE94, false], // ة Teh Marbuta
        0x06C0 => [0xFE93, 0xFE94, 0xFE93, 0xFE94, false], // ۀ Heh with Yeh
        0x06C2 => [0xFE93, 0xFE94, 0xFE93, 0xFE94, false], // ۂ Heh Goal with Hamza
        0x06C3 => [0xFE93, 0xFE94, 0xFE93, 0xFE94, false], // ۃ Teh Marbuta Goal
        0x062F => [0xFEA9, 0xFEAA, 0xFEA9, 0xFEAA, false], // د Dal
        0x0630 => [0xFEAB, 0xFEAC, 0xFEAB, 0xFEAC, false], // ذ Thal
        0x0688 => [0xFB88, 0xFB89, 0xFB88, 0xFB89, false], // ڈ Ddal (Urdu)
        0x0631 => [0xFEAD, 0xFEAE, 0xFEAD, 0xFEAE, false], // ر Reh
        0x0632 => [0xFEAF, 0xFEB0, 0xFEAF, 0xFEB0, false], // ز Zain
        0x0691 => [0xFB8C, 0xFB8D, 0xFB8C, 0xFB8D, false], // ڑ Rreh (Urdu)
        0x0698 => [0xFB8A, 0xFB8B, 0xFB8A, 0xFB8B, false], // ژ Jeh (Urdu)
        0x0648 => [0xFEED, 0xFEEE, 0xFEED, 0xFEEE, false], // و Waw
        0x06BA => [0xFB9E, 0xFB9F, 0xFB9E, 0xFB9F, false], // ں Noon Ghunna (Urdu)
        0x06D2 => [0xFBAE, 0xFBAF, 0xFBFE, 0xFBFF, false], // ے Bari Ye (Urdu)
        0x06D3 => [0xFBB0, 0xFBB1, 0xFBFE, 0xFBFF, false], // ۓ Bari Ye with Hamza
        0x0649 => [0xFEEF, 0xFEF0, 0xFEEF, 0xFEF0, false], // ى Alef Maksura

        // Dual-joining (canJoinLeft = true)
        0x0626 => [0xFE89, 0xFE8A, 0xFE8B, 0xFE8C, true],  // ئ Yeh with Hamza
        0x0628 => [0xFE8F, 0xFE90, 0xFE91, 0xFE92, true],  // ب Beh
        0x067E => [0xFB56, 0xFB57, 0xFB58, 0xFB59, true],  // پ Peh (Urdu)
        0x062A => [0xFE95, 0xFE96, 0xFE97, 0xFE98, true],  // ت Teh
        0x0679 => [0xFB66, 0xFB67, 0xFB68, 0xFB69, true],  // ٹ Tteh (Urdu)
        0x062B => [0xFE99, 0xFE9A, 0xFE9B, 0xFE9C, true],  // ث Theh
        0x062C => [0xFE9D, 0xFE9E, 0xFE9F, 0xFEA0, true],  // ج Jeem
        0x0686 => [0xFB7A, 0xFB7B, 0xFB7C, 0xFB7D, true],  // چ Tcheh (Urdu)
        0x062D => [0xFEA1, 0xFEA2, 0xFEA3, 0xFEA4, true],  // ح Hah
        0x062E => [0xFEA5, 0xFEA6, 0xFEA7, 0xFEA8, true],  // خ Khah
        0x0633 => [0xFEB1, 0xFEB2, 0xFEB3, 0xFEB4, true],  // س Seen
        0x0634 => [0xFEB5, 0xFEB6, 0xFEB7, 0xFEB8, true],  // ش Sheen
        0x0635 => [0xFEB9, 0xFEBA, 0xFEBB, 0xFEBC, true],  // ص Sad
        0x0636 => [0xFEBD, 0xFEBE, 0xFEBF, 0xFEC0, true],  // ض Dad
        0x0637 => [0xFEC1, 0xFEC2, 0xFEC3, 0xFEC4, true],  // ط Tah
        0x0638 => [0xFEC5, 0xFEC6, 0xFEC7, 0xFEC8, true],  // ظ Zah
        0x0639 => [0xFEC9, 0xFECA, 0xFECB, 0xFECC, true],  // ع Ain
        0x063A => [0xFECD, 0xFECE, 0xFECF, 0xFED0, true],  // غ Ghain
        0x0641 => [0xFED1, 0xFED2, 0xFED3, 0xFED4, true],  // ف Feh
        0x0642 => [0xFED5, 0xFED6, 0xFED7, 0xFED8, true],  // ق Qaf
        0x06A9 => [0xFB8E, 0xFB8F, 0xFB90, 0xFB91, true],  // ک Keheh (Urdu)
        0x0643 => [0xFED9, 0xFEDA, 0xFEDB, 0xFEDC, true],  // ك Arabic Kaf
        0x06AF => [0xFB92, 0xFB93, 0xFB94, 0xFB95, true],  // گ Gaf (Urdu)
        0x0644 => [0xFEDD, 0xFEDE, 0xFEDF, 0xFEE0, true],  // ل Lam
        0x0645 => [0xFEE1, 0xFEE2, 0xFEE3, 0xFEE4, true],  // م Meem
        0x0646 => [0xFEE5, 0xFEE6, 0xFEE7, 0xFEE8, true],  // ن Noon
        0x0647 => [0xFEE9, 0xFEEA, 0xFEEB, 0xFEEC, true],  // ه Arabic Heh
        0x06C1 => [0xFBA6, 0xFBA7, 0xFBA8, 0xFBA9, true],  // ہ Urdu Heh Goal
        0x06BE => [0xFBAA, 0xFBAB, 0xFBAC, 0xFBAD, true],  // ھ Urdu Heh Doachashmee
        0x06CC => [0xFBFC, 0xFBFD, 0xFBFE, 0xFBFF, true],  // ی Urdu Farsi Yeh
        0x064A => [0xFEF1, 0xFEF2, 0xFEF3, 0xFEF4, true],  // ي Arabic Yeh
        0x0640 => [0x0640, 0x0640, 0x0640, 0x0640, true],  // ـ Tatweel
    ];

    /**
     * Lam + Alef ligatures: Alef codepoint => [Isolated, Final]
     */
    private const LAM_ALEF_MAP = [
        0x0622 => [0xFEF5, 0xFEF6], // لآ
        0x0623 => [0xFEF7, 0xFEF8], // لأ
        0x0625 => [0xFEF9, 0xFEFA], // لإ
        0x0627 => [0xFEFB, 0xFEFC], // لا
    ];

    /**
     * Check whether a string contains any Arabic/Urdu script characters.
     */
    public static function containsUrdu(?string $text): bool
    {
        if ($text === null || $text === '') {
            return false;
        }

        return (bool) preg_match('/[\x{0600}-\x{06FF}\x{FB50}-\x{FDFF}\x{FE70}-\x{FEFF}]/u', $text);
    }

    /**
     * Ensure storage/fonts exists for DomPDF font metric caching and resolve the local file:// URL
     * for a TrueType font inside DomPDF's chroot (public/fonts/Tahoma.ttf) that supports all Urdu glyphs.
     *
     * @return array{regular: ?string, bold: ?string}
     */
    public static function resolveUrduFontUrls(): array
    {
        try {
            $fontCacheDir = storage_path('fonts');
            if (!is_dir($fontCacheDir)) {
                @mkdir($fontCacheDir, 0775, true);
            }

            $installedFontsFile = $fontCacheDir . '/installed-fonts.json';
            if (is_file($installedFontsFile)) {
                $installed = @json_decode((string) @file_get_contents($installedFontsFile), true);
                if (is_array($installed)) {
                    $dirty = false;
                    foreach ($installed as $family => $variants) {
                        if (!is_array($variants)) {
                            continue;
                        }
                        foreach ($variants as $style => $fontPath) {
                            if (!is_string($fontPath)) {
                                continue;
                            }
                            $base = basename($fontPath);
                            if (is_file($fontCacheDir . '/' . $base . '.ufm') && $fontPath !== $base) {
                                $installed[$family][$style] = $base;
                                $dirty = true;
                            } elseif (!is_file($fontPath . '.ufm') && !is_file($fontCacheDir . '/' . $base . '.ufm')) {
                                unset($installed[$family][$style]);
                                $dirty = true;
                            }
                        }
                        if (empty($installed[$family])) {
                            unset($installed[$family]);
                            $dirty = true;
                        }
                    }
                    if ($dirty) {
                        @file_put_contents($installedFontsFile, json_encode($installed, JSON_PRETTY_PRINT));
                    }
                }
            }

            $regPath = public_path('fonts/Tahoma.ttf');
            $boldPath = public_path('fonts/Tahoma-Bold.ttf');

            // Auto-populate public/fonts/Tahoma.ttf from system fonts if missing
            if (!is_file($regPath)) {
                $sysCandidates = [
                    ['/System/Library/Fonts/Supplemental/Tahoma.ttf', '/System/Library/Fonts/Supplemental/Tahoma Bold.ttf'],
                    ['/System/Library/Fonts/Supplemental/Arial.ttf', '/System/Library/Fonts/Supplemental/Arial Bold.ttf'],
                    ['C:/Windows/Fonts/tahoma.ttf', 'C:/Windows/Fonts/tahomabd.ttf'],
                    ['/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf', '/usr/share/fonts/truetype/noto/NotoSansArabic-Bold.ttf'],
                ];
                foreach ($sysCandidates as [$sysReg, $sysBold]) {
                    if (is_file($sysReg)) {
                        @mkdir(dirname($regPath), 0775, true);
                        @copy($sysReg, $regPath);
                        if (is_file($sysBold)) {
                            @copy($sysBold, $boldPath);
                        }
                        break;
                    }
                }
            }

            if (is_file($regPath)) {
                return [
                    'regular' => 'file://' . str_replace(' ', '%20', $regPath),
                    'bold'    => is_file($boldPath)
                        ? 'file://' . str_replace(' ', '%20', $boldPath)
                        : 'file://' . str_replace(' ', '%20', $regPath),
                ];
            }
        } catch (\Throwable) {
            // Fall back to DejaVu Sans
        }

        return ['regular' => null, 'bold' => null];
    }

    /**
     * Shape all Urdu/Arabic text nodes inside an HTML document before passing it to DomPDF.
     */
    public static function shapeHtml(string $html): string
    {
        if (!self::containsUrdu($html)) {
            return $html;
        }

        return (string) preg_replace_callback(
            '/>([^<]+)</u',
            function (array $matches): string {
                $rawText = $matches[1];
                if (!self::containsUrdu($rawText)) {
                    return $matches[0];
                }

                $decoded = html_entity_decode($rawText, ENT_QUOTES | ENT_HTML5, 'UTF-8');
                $shaped = self::shape($decoded, 90);
                $encoded = htmlspecialchars($shaped, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

                return '>' . nl2br($encoded, false) . '<';
            },
            $html
        );
    }

    /**
     * Alias for shape().
     */
    public static function shapeText(?string $text, int $wrapWidth = 90): string
    {
        return self::shape($text, $wrapWidth);
    }

    /**
     * Shape Urdu/Arabic text into connected Presentation Forms and reorder RTL tokens for DomPDF.
     * If the string contains no Urdu/Arabic characters, it is returned unchanged.
     */
    public static function shape(?string $text, int $wrapWidth = 90): string
    {
        if ($text === null || $text === '' || !self::containsUrdu($text)) {
            return (string) $text;
        }

        // If already shaped into Presentation Forms (\x{FB50}-\x{FEFF}), do not double-shape
        if (preg_match('/[\x{FB50}-\x{FDFF}\x{FE70}-\x{FEFF}]/u', $text)) {
            return $text;
        }

        $hasFullUrduFont = self::resolveUrduFontUrls()['regular'] !== null;
        $rawLines = preg_split('/\r\n|\r|\n/u', $text) ?: [$text];
        $shapedLines = [];

        foreach ($rawLines as $rawLine) {
            if (trim($rawLine) === '' || !self::containsUrdu($rawLine)) {
                $shapedLines[] = $rawLine;
                continue;
            }

            $wrappedSegments = self::wrapLogicalLine($rawLine, $wrapWidth);
            foreach ($wrappedSegments as $segment) {
                $shapedLines[] = self::shapeAndReorderLine($segment, $hasFullUrduFont);
            }
        }

        return implode("\n", $shapedLines);
    }

    /**
     * Wrap a logical RTL line into segments of at most $maxChars characters at word boundaries.
     *
     * @return list<string>
     */
    private static function wrapLogicalLine(string $line, int $maxChars): array
    {
        if ($maxChars <= 0 || mb_strlen($line, 'UTF-8') <= $maxChars) {
            return [$line];
        }

        $words = preg_split('/(\s+)/u', trim($line), -1, PREG_SPLIT_DELIM_CAPTURE) ?: [$line];
        $segments = [];
        $current = '';

        foreach ($words as $piece) {
            if ($current === '') {
                $current = $piece;
                continue;
            }

            if (mb_strlen($current . $piece, 'UTF-8') > $maxChars && trim($current) !== '') {
                $segments[] = trim($current);
                $current = ltrim($piece);
            } else {
                $current .= $piece;
            }
        }

        if (trim($current) !== '') {
            $segments[] = trim($current);
        }

        return $segments ?: [$line];
    }

    /**
     * Shape contextual glyphs and reorder RTL vs LTR runs for a single visual line.
     */
    private static function shapeAndReorderLine(string $line, bool $hasFullUrduFont): string
    {
        $rawParts = preg_split('/(\s+)/u', $line, -1, PREG_SPLIT_DELIM_CAPTURE) ?: [$line];
        $visualTokens = [];

        foreach ($rawParts as $part) {
            if ($part === '') {
                continue;
            }
            if (preg_match('/^\s+$/u', $part)) {
                $visualTokens[] = ['type' => 'space', 'text' => $part];
                continue;
            }

            if (!self::containsUrdu($part) && preg_match('/[A-Za-z0-9]/u', $part)) {
                $visualTokens[] = ['type' => 'ltr', 'text' => $part];
                continue;
            }

            $shapedWord = self::shapeRtlWord($part, $hasFullUrduFont);
            $visualTokens[] = ['type' => 'rtl', 'text' => $shapedWord];
        }

        $grouped = [];
        $ltrBuffer = [];

        foreach ($visualTokens as $tok) {
            if ($tok['type'] === 'ltr') {
                $ltrBuffer[] = $tok['text'];
            } elseif ($tok['type'] === 'space' && !empty($ltrBuffer)) {
                $ltrBuffer[] = $tok['text'];
            } else {
                if (!empty($ltrBuffer)) {
                    $trailingSpace = '';
                    if (count($ltrBuffer) > 1 && preg_match('/^\s+$/u', end($ltrBuffer))) {
                        $trailingSpace = array_pop($ltrBuffer);
                    }
                    $grouped[] = implode('', $ltrBuffer);
                    if ($trailingSpace !== '') {
                        $grouped[] = $trailingSpace;
                    }
                    $ltrBuffer = [];
                }
                $grouped[] = $tok['text'];
            }
        }

        if (!empty($ltrBuffer)) {
            $grouped[] = implode('', $ltrBuffer);
        }

        return implode('', array_reverse($grouped));
    }

    /**
     * Shape a single Urdu/Arabic word into contextual presentation forms and reverse its codepoints
     * so DomPDF renders the connected glyphs from Right to Left.
     */
    private static function shapeRtlWord(string $word, bool $hasFullUrduFont): string
    {
        $chars = preg_split('//u', $word, -1, PREG_SPLIT_NO_EMPTY) ?: [];
        $codepoints = array_map(fn (string $c) => mb_ord($c, 'UTF-8'), $chars);

        $filtered = [];
        foreach ($codepoints as $cp) {
            if ($cp >= 0x064B && $cp <= 0x065F) {
                continue;
            }
            $filtered[] = $cp;
        }
        $codepoints = $filtered;
        $n = count($codepoints);
        $shaped = [];

        for ($i = 0; $i < $n; $i++) {
            $curr = $codepoints[$i];

            if (!isset(self::GLYPH_MAP[$curr])) {
                $curr = match ($curr) {
                    0x0028 => 0x0029, // ( -> )
                    0x0029 => 0x0028, // ) -> (
                    0x005B => 0x005D, // [ -> ]
                    0x005D => 0x005B, // ] -> [
                    0x06D4 => $hasFullUrduFont ? 0x06D4 : 0x002D, // ۔ Urdu full stop
                    default => $curr,
                };
                $shaped[] = $curr;
                continue;
            }

            $prev = $i > 0 ? $codepoints[$i - 1] : null;
            $next = ($i + 1 < $n) ? $codepoints[$i + 1] : null;

            $prevJoinsLeft = $prev !== null && isset(self::GLYPH_MAP[$prev]) && self::GLYPH_MAP[$prev][4];

            if ($curr === 0x0644 && $next !== null && isset(self::LAM_ALEF_MAP[$next])) {
                $ligature = self::LAM_ALEF_MAP[$next];
                $shaped[] = $prevJoinsLeft ? $ligature[1] : $ligature[0];
                $i++;
                continue;
            }

            $currCanJoinLeft = self::GLYPH_MAP[$curr][4];
            $nextJoinsRight = $next !== null && isset(self::GLYPH_MAP[$next]);
            $joinLeft = $currCanJoinLeft && $nextJoinsRight;
            $joinRight = $prevJoinsLeft;

            if ($joinRight && $joinLeft) {
                $formIdx = 3; // Medial
            } elseif ($joinRight && !$joinLeft) {
                $formIdx = 1; // Final
            } elseif (!$joinRight && $joinLeft) {
                $formIdx = 2; // Initial
            } else {
                $formIdx = 0; // Isolated
            }

            $glyph = self::GLYPH_MAP[$curr][$formIdx];

            if (!$hasFullUrduFont) {
                $glyph = match ($glyph) {
                    0xFBA6 => 0xFEE9,
                    0xFBA7 => 0xFEEA,
                    0xFBA8 => 0xFEEB,
                    0xFBA9 => 0xFEEC,
                    0xFBAE => 0xFEEF,
                    0xFBAF => 0xFEF0,
                    default => $glyph,
                };
            }

            $shaped[] = $glyph;
        }

        $reversed = array_reverse($shaped);

        return implode('', array_map(fn (int $cp) => mb_chr($cp, 'UTF-8'), $reversed));
    }
}
