@php
    $req = request();
    $calPaperWidthMm = $req->has('paper_width_mm')
        ? (int) $req->query('paper_width_mm', 0)
        : (int) ($setting->print_paper_width_mm ?? 0);
    $calMarginTopMm = $req->has('margin_top_mm')
        ? (int) $req->query('margin_top_mm', 0)
        : (int) ($setting->print_margin_top_mm ?? 0);
    $calMarginBottomMm = $req->has('margin_bottom_mm')
        ? (int) $req->query('margin_bottom_mm', 4)
        : (int) ($setting->print_margin_bottom_mm ?? 4);
    $calMarginLeftMm = $req->has('margin_left_mm')
        ? (int) $req->query('margin_left_mm', 0)
        : (int) ($setting->print_margin_left_mm ?? 0);
    $calMarginRightMm = $req->has('margin_right_mm')
        ? (int) $req->query('margin_right_mm', 0)
        : (int) ($setting->print_margin_right_mm ?? 0);
    $calFontScale = $req->has('font_scale')
        ? max(70, min(150, (int) $req->query('font_scale', 100)))
        : max(70, min(150, (int) ($setting->print_font_scale ?? 100)));
    $calContrastMode = (string) ($req->query('contrast_mode', $setting->print_contrast_mode ?? 'standard'));
    if (!in_array($calContrastMode, ['standard', 'high_contrast', 'extra_bold'], true)) {
        $calContrastMode = 'standard';
    }
    $calScaleMode = (string) ($req->query('scale_mode', $setting->print_scale_mode ?? 'auto'));
    if (!in_array($calScaleMode, ['auto', 'noscale', 'fit', 'shrink'], true)) {
        $calScaleMode = 'auto';
    }
    $calShowLogo = $req->has('print_show_logo')
        ? $req->boolean('print_show_logo')
        : ($req->has('show_logo')
            ? $req->boolean('show_logo')
            : (bool) ($setting->print_show_logo ?? true));

    $calConfigJson = json_encode([
        'paperWidthMm'   => $calPaperWidthMm,
        'marginTopMm'    => $calMarginTopMm,
        'marginBottomMm' => $calMarginBottomMm,
        'marginLeftMm'   => $calMarginLeftMm,
        'marginRightMm'  => $calMarginRightMm,
        'fontScale'      => $calFontScale,
        'contrastMode'   => $calContrastMode,
        'scaleMode'      => $calScaleMode,
        'showLogo'       => $calShowLogo,
    ]);
@endphp
<meta name="karobar-print-config" content="{{ $calConfigJson }}">
<style id="karobar-print-calibration">
@if(!$calShowLogo)
  .logo, .wm, .watermark { display: none !important; }
@endif

@if($calPaperWidthMm > 0)
  .receipt {
    width: {{ $calPaperWidthMm }}mm !important;
    max-width: 100% !important;
  }
  .page {
    width: {{ $calPaperWidthMm }}mm !important;
    max-width: 100% !important;
  }
  body:not(:has(.receipt)):not(:has(.page)) {
    width: {{ $calPaperWidthMm }}mm !important;
    max-width: 100% !important;
  }
@endif

@if($calMarginTopMm !== 0 || $calMarginBottomMm !== 0 || $calMarginLeftMm !== 0 || $calMarginRightMm !== 0)
  .receipt {
    @if($calMarginTopMm !== 0) padding-top: {{ max(0, $calMarginTopMm) }}mm !important; @endif
    @if($calMarginBottomMm > 0) padding-bottom: {{ $calMarginBottomMm }}mm !important; @endif
    @if($calMarginLeftMm > 0) padding-left: {{ $calMarginLeftMm }}mm !important; @endif
    @if($calMarginLeftMm < 0) margin-left: {{ $calMarginLeftMm }}mm !important; @endif
    @if($calMarginRightMm > 0) padding-right: {{ $calMarginRightMm }}mm !important; @endif
  }
  body:not(:has(.receipt)):not(:has(.page)) {
    @if($calMarginTopMm !== 0) padding-top: {{ max(0, $calMarginTopMm) }}mm !important; @endif
    @if($calMarginBottomMm > 0) padding-bottom: {{ $calMarginBottomMm }}mm !important; @endif
    @if($calMarginLeftMm > 0) padding-left: {{ $calMarginLeftMm }}mm !important; @endif
    @if($calMarginRightMm > 0) padding-right: {{ $calMarginRightMm }}mm !important; @endif
  }
@endif

@if($calFontScale !== 100)
  .receipt .content,
  .receipt > table,
  .page,
  body:not(:has(.receipt)):not(:has(.page)) {
    zoom: {{ round($calFontScale / 100, 3) }};
  }
@endif

@if($calContrastMode === 'high_contrast' || $calContrastMode === 'extra_bold')
  :root {
    --text: #000000 !important;
    --muted: #000000 !important;
    --border: #000000 !important;
  }
  body, .receipt, .page, table, th, td, div, span, p, h1, h2, h3 {
    color: #000000 !important;
    -webkit-font-smoothing: none !important;
  }
  .hr, .double-hr, .dotted-hr, .solid-hr, .line, th, td, .meta, .remarks, .footer-total, .footer-total .row {
    border-color: #000000 !important;
  }
  .wm img {
    opacity: 0.22 !important;
    filter: grayscale(100%) contrast(150%) !important;
  }
@endif

@if($calContrastMode === 'extra_bold')
  body, .receipt, .page, table, th, td, div, span {
    font-weight: 800 !important;
    text-shadow: 0.2px 0 0 #000000;
  }
  thead th, tbody td {
    border-width: 1.5px !important;
  }
@endif
</style>
