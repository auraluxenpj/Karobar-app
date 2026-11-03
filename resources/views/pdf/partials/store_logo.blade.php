@php
    $shouldShowLogo = isset($showLogo)
        ? (bool) $showLogo
        : (bool) ($setting->share_show_logo ?? true);

    $resolvedLogoSrc = null;
    if ($shouldShowLogo) {
        if (!empty($logoDataUri)) {
            $resolvedLogoSrc = $logoDataUri;
        } elseif (isset($setting) && is_object($setting) && method_exists($setting, 'resolveLogoDataUri')) {
            $resolvedLogoSrc = $setting->resolveLogoDataUri();
        } elseif (!empty($setting->logo_url ?? null)) {
            $resolvedLogoSrc = $setting->logo_url;
        }
    }
@endphp
@if($shouldShowLogo && !empty($resolvedLogoSrc))
    <div class="store-logo-wrap">
        <img src="{!! $resolvedLogoSrc !!}" alt="Store Logo" class="store-logo" />
    </div>
@endif

