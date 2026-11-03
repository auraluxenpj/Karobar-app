<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('settings', function (Blueprint $table) {
            if (! Schema::hasColumn('settings', 'share_paper_size')) {
                $table->string('share_paper_size', 20)->default('a4')->after('a4_template');
            }
            if (! Schema::hasColumn('settings', 'share_show_logo')) {
                $table->boolean('share_show_logo')->default(true)->after('logo_path');
            }
        });
    }

    public function down(): void
    {
        Schema::table('settings', function (Blueprint $table) {
            $columns = array_filter([
                'share_paper_size',
                'share_show_logo',
            ], fn (string $col) => Schema::hasColumn('settings', $col));

            if (! empty($columns)) {
                $table->dropColumn($columns);
            }
        });
    }
};

