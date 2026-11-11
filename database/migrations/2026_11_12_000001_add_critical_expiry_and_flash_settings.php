<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (Schema::hasTable('settings')) {
            Schema::table('settings', function (Blueprint $table) {
                if (!Schema::hasColumn('settings', 'expiry_critical_days')) {
                    $table->unsignedInteger('expiry_critical_days')->default(30)->after('expiry_warning_days');
                }
                if (!Schema::hasColumn('settings', 'expiry_daily_flash_limit')) {
                    $table->unsignedTinyInteger('expiry_daily_flash_limit')->default(5)->after('expiry_critical_days');
                }
            });
        }

        if (Schema::hasTable('products')) {
            Schema::table('products', function (Blueprint $table) {
                if (!Schema::hasColumn('products', 'expiry_critical_days')) {
                    $table->unsignedInteger('expiry_critical_days')->nullable()->default(null)->after('expiry_warning_days');
                }
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('settings')) {
            Schema::table('settings', function (Blueprint $table) {
                if (Schema::hasColumn('settings', 'expiry_daily_flash_limit')) {
                    $table->dropColumn('expiry_daily_flash_limit');
                }
                if (Schema::hasColumn('settings', 'expiry_critical_days')) {
                    $table->dropColumn('expiry_critical_days');
                }
            });
        }

        if (Schema::hasTable('products')) {
            Schema::table('products', function (Blueprint $table) {
                if (Schema::hasColumn('products', 'expiry_critical_days')) {
                    $table->dropColumn('expiry_critical_days');
                }
            });
        }
    }
};
