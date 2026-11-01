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
        //
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
