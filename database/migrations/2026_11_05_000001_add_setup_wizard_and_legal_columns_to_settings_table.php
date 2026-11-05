<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('settings')) {
            return;
        }

        Schema::table('settings', function (Blueprint $table) {
            if (!Schema::hasColumn('settings', 'is_setup_completed')) {
                $table->boolean('is_setup_completed')->default(false);
            }
            if (!Schema::hasColumn('settings', 'setup_completed_at')) {
                $table->timestamp('setup_completed_at')->nullable();
            }
            if (!Schema::hasColumn('settings', 'terms_accepted_at')) {
                $table->timestamp('terms_accepted_at')->nullable();
            }
            if (!Schema::hasColumn('settings', 'privacy_accepted_at')) {
                $table->timestamp('privacy_accepted_at')->nullable();
            }
            if (!Schema::hasColumn('settings', 'legal_accepted_version')) {
                $table->string('legal_accepted_version', 30)->nullable();
            }
        });

        // If an existing installation already configured a custom store_name, mark setup as completed
        // so existing stores are not interrupted on upgrade.
        try {
            DB::table('settings')
                ->whereNotNull('store_name')
                ->where('store_name', '!=', '')
                ->where('store_name', '!=', 'Karobar App')
                ->update([
                    'is_setup_completed' => true,
                    'setup_completed_at' => now(),
                ]);
        } catch (\Throwable) {
            // Ignore during early schema bootstrap
        }
    }

    public function down(): void
    {
        if (!Schema::hasTable('settings')) {
            return;
        }

        Schema::table('settings', function (Blueprint $table) {
            $dropCols = [];
            foreach ([
                'is_setup_completed',
                'setup_completed_at',
                'terms_accepted_at',
                'privacy_accepted_at',
                'legal_accepted_version',
            ] as $col) {
                if (Schema::hasColumn('settings', $col)) {
                    $dropCols[] = $col;
                }
            }
            if (!empty($dropCols)) {
                $table->dropColumn($dropCols);
            }
        });
    }
};

