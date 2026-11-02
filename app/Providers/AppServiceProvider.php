<?php

namespace App\Providers;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        foreach (['framework/views', 'framework/cache/data', 'framework/sessions', 'framework/testing', 'fonts'] as $dir) {
            $path = storage_path($dir);
            if (!is_dir($path)) {
                @mkdir($path, 0775, true);
            }
        }

        if (!config('view.compiled')) {
            config(['view.compiled' => realpath(storage_path('framework/views')) ?: storage_path('framework/views')]);
        }
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        try {
            if (DB::getDriverName() === 'sqlite') {
                DB::unprepared(
                    "PRAGMA temp_store = MEMORY;\n"
                    . "PRAGMA cache_size = -65536;\n"
                    . "PRAGMA mmap_size = 268435456;"
                );
            }
        } catch (\Throwable) {
            // Ignore when DB connection is not yet initialized
        }
    }
}
