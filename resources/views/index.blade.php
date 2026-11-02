<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <script>
      try {
        if (localStorage.getItem('theme_mode') === 'dark') {
          document.documentElement.classList.add('dark');
        }
      } catch (_) {}
    </script>
    <style>
      html, body { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
      body { margin: 0; background-color: #f3f6fb; color: #0f172a; font-family: system-ui, -apple-system, sans-serif; }
      html.dark body { background-color: #0b1220; color: #f1f5f9; }
      .boot-shell {
        min-height: 100dvh;
        padding: 14px;
        box-sizing: border-box;
        display: grid;
        grid-template-columns: 286px minmax(0, 1fr);
        gap: 16px;
        contain: layout style paint;
      }
      @media (max-width: 1023px) {
        .boot-shell { grid-template-columns: minmax(0, 1fr); padding: 12px; }
        .boot-sidebar { display: none !important; }
      }
      @media (max-width: 767px) {
        .boot-shell { padding: 8px; }
        .boot-hide-sm { display: none !important; }
      }
      .boot-sidebar {
        background: rgba(255,255,255,0.86);
        border: 1px solid rgba(226,232,240,0.85);
        border-radius: 24px;
        padding: 14px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        height: calc(100dvh - 28px);
        box-sizing: border-box;
      }
      .boot-card {
        background: rgba(255,255,255,0.86);
        border: 1px solid rgba(226,232,240,0.85);
        border-radius: 20px;
        padding: 16px;
      }
      .boot-topbar {
        background: rgba(255,255,255,0.86);
        border: 1px solid rgba(226,232,240,0.85);
        border-radius: 16px;
        min-height: 54px;
        padding: 8px 14px;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      html.dark .boot-sidebar,
      html.dark .boot-card,
      html.dark .boot-topbar {
        background: rgba(30,41,59,0.82);
        border-color: rgba(51,65,85,0.75);
      }
      .boot-bone, .boot-bone-soft {
        border-radius: 999px;
        position: relative;
        overflow: hidden;
      }
      .boot-bone { background: #e4e6eb; }
      .boot-bone-soft { background: #f0f2f5; }
      html.dark .boot-bone { background: rgba(51,65,85,0.78); }
      html.dark .boot-bone-soft { background: rgba(30,41,59,0.68); }
      .boot-bone::after, .boot-bone-soft::after {
        content: "";
        position: absolute;
        inset: 0;
        transform: translateX(-100%);
        background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.45) 35%, rgba(255,255,255,0.78) 50%, rgba(255,255,255,0.45) 65%, rgba(255,255,255,0) 100%);
        animation: boot-shimmer 1.45s cubic-bezier(0.4, 0, 0.2, 1) infinite;
      }
      html.dark .boot-bone::after, html.dark .boot-bone-soft::after {
        background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(148,163,184,0.1) 35%, rgba(226,232,240,0.2) 50%, rgba(148,163,184,0.1) 65%, rgba(255,255,255,0) 100%);
      }
      @keyframes boot-shimmer { 100% { transform: translateX(100%); } }
      .boot-main { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
      .boot-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; }
    </style>
    @if (file_exists(public_path('build/manifest.json')) || file_exists(public_path('hot')))
        @viteReactRefresh
        @vite(['resources/css/app.css', 'resources/js/app.jsx'])
    @endif
</head>
<body>
    <div id="app">
        <div class="boot-shell" aria-busy="true" aria-hidden="true">
            <!-- Left Sidebar Skeleton -->
            <aside class="boot-sidebar">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding-bottom:10px;border-bottom:1px solid rgba(148,163,184,0.18);">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <div class="boot-bone" style="width:36px;height:36px;border-radius:11px;"></div>
                        <div style="display:flex;flex-direction:column;gap:6px;">
                            <div class="boot-bone" style="width:110px;height:14px;"></div>
                            <div class="boot-bone-soft" style="width:78px;height:9px;"></div>
                        </div>
                    </div>
                    <div class="boot-bone-soft" style="width:28px;height:28px;border-radius:10px;"></div>
                </div>
                <div style="display:flex;gap:6px;">
                    <div class="boot-bone-soft" style="flex:1;height:32px;border-radius:11px;"></div>
                    <div class="boot-bone-soft" style="width:32px;height:32px;border-radius:11px;"></div>
                </div>
                <div style="display:flex;flex-direction:column;gap:10px;padding-top:4px;flex:1;">
                    <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:11px;background:rgba(59,130,246,0.08);">
                        <div class="boot-bone" style="width:20px;height:20px;border-radius:7px;"></div>
                        <div class="boot-bone" style="width:96px;height:13px;"></div>
                    </div>
                    <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 8px;">
                        <div class="boot-bone" style="width:108px;height:11px;"></div>
                        <div class="boot-bone-soft" style="width:20px;height:14px;border-radius:5px;"></div>
                    </div>
                    <div style="display:flex;align-items:center;gap:10px;padding:7px 10px;"><div class="boot-bone" style="width:20px;height:20px;border-radius:7px;"></div><div class="boot-bone" style="width:96px;height:13px;"></div></div>
                    <div style="display:flex;align-items:center;gap:10px;padding:7px 10px;"><div class="boot-bone" style="width:20px;height:20px;border-radius:7px;"></div><div class="boot-bone" style="width:126px;height:13px;"></div></div>
                    <div style="display:flex;align-items:center;gap:10px;padding:7px 10px;"><div class="boot-bone" style="width:20px;height:20px;border-radius:7px;"></div><div class="boot-bone" style="width:88px;height:13px;"></div></div>
                    <div style="display:flex;align-items:center;gap:10px;padding:7px 10px;"><div class="boot-bone" style="width:20px;height:20px;border-radius:7px;"></div><div class="boot-bone" style="width:76px;height:13px;"></div></div>
                    <div style="display:flex;align-items:center;gap:10px;padding:7px 10px;"><div class="boot-bone" style="width:20px;height:20px;border-radius:7px;"></div><div class="boot-bone" style="width:104px;height:13px;"></div></div>
                    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 8px 4px;">
                        <div class="boot-bone" style="width:80px;height:11px;"></div>
                        <div class="boot-bone-soft" style="width:20px;height:14px;border-radius:5px;"></div>
                    </div>
                    <div style="display:flex;align-items:center;gap:10px;padding:7px 10px;"><div class="boot-bone" style="width:20px;height:20px;border-radius:7px;"></div><div class="boot-bone" style="width:104px;height:13px;"></div></div>
                    <div style="display:flex;align-items:center;gap:10px;padding:7px 10px;"><div class="boot-bone" style="width:20px;height:20px;border-radius:7px;"></div><div class="boot-bone" style="width:118px;height:13px;"></div></div>
                    <div style="display:flex;align-items:center;gap:10px;padding:7px 10px;"><div class="boot-bone" style="width:20px;height:20px;border-radius:7px;"></div><div class="boot-bone" style="width:132px;height:13px;"></div></div>
                </div>
                <div class="boot-bone-soft" style="height:36px;border-radius:10px;"></div>
            </aside>

            <!-- Right Main Area: Topbar + Content -->
            <div class="boot-main">
                <div class="boot-topbar">
                    <div style="display:flex;align-items:center;gap:8px;min-width:0;">
                        <div class="boot-bone-soft" style="width:36px;height:36px;border-radius:12px;flex-shrink:0;"></div>
                        <div class="boot-bone-soft boot-hide-sm" style="width:112px;height:36px;border-radius:12px;"></div>
                        <div class="boot-bone-soft boot-hide-sm" style="width:104px;height:36px;border-radius:12px;"></div>
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
                        <div class="boot-bone-soft boot-hide-sm" style="width:104px;height:36px;border-radius:12px;"></div>
                        <div class="boot-bone-soft boot-hide-sm" style="width:112px;height:36px;border-radius:12px;"></div>
                        <div class="boot-bone-soft" style="width:36px;height:36px;border-radius:12px;"></div>
                        <div class="boot-bone-soft" style="width:36px;height:36px;border-radius:12px;"></div>
                        <div class="boot-bone" style="width:44px;height:36px;border-radius:12px;"></div>
                    </div>
                </div>
                <div class="boot-grid">
                    <div class="boot-card"><div class="boot-bone" style="width:45%;height:12px;margin-bottom:14px;"></div><div class="boot-bone" style="width:72%;height:28px;border-radius:10px;margin-bottom:12px;"></div><div class="boot-bone-soft" style="width:55%;height:10px;"></div></div>
                    <div class="boot-card"><div class="boot-bone" style="width:45%;height:12px;margin-bottom:14px;"></div><div class="boot-bone" style="width:68%;height:28px;border-radius:10px;margin-bottom:12px;"></div><div class="boot-bone-soft" style="width:55%;height:10px;"></div></div>
                    <div class="boot-card"><div class="boot-bone" style="width:45%;height:12px;margin-bottom:14px;"></div><div class="boot-bone" style="width:74%;height:28px;border-radius:10px;margin-bottom:12px;"></div><div class="boot-bone-soft" style="width:55%;height:10px;"></div></div>
                    <div class="boot-card"><div class="boot-bone" style="width:45%;height:12px;margin-bottom:14px;"></div><div class="boot-bone" style="width:64%;height:28px;border-radius:10px;margin-bottom:12px;"></div><div class="boot-bone-soft" style="width:55%;height:10px;"></div></div>
                </div>
                <div class="boot-card" style="flex:1;display:flex;flex-direction:column;gap:14px;">
                    <div style="display:flex;align-items:center;justify-content:space-between;padding-bottom:12px;border-bottom:1px solid rgba(148,163,184,0.16);">
                        <div class="boot-bone" style="width:180px;height:18px;"></div>
                        <div class="boot-bone-soft" style="width:120px;height:34px;border-radius:10px;"></div>
                    </div>
                    <div class="boot-bone-soft" style="width:100%;height:42px;border-radius:12px;"></div>
                    <div class="boot-bone-soft" style="width:100%;height:46px;border-radius:12px;"></div>
                    <div class="boot-bone-soft" style="width:100%;height:46px;border-radius:12px;"></div>
                    <div class="boot-bone-soft" style="width:100%;height:46px;border-radius:12px;"></div>
                    <div class="boot-bone-soft" style="width:100%;height:46px;border-radius:12px;"></div>
                </div>
            </div>
        </div>
    </div>
</body>
</html>
