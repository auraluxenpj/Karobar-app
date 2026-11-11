<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('settings')) {
            return;
        }

        Schema::table('settings', function (Blueprint $table) {
            if (! Schema::hasColumn('settings', 'print_paper_width_mm')) {
                $table->integer('print_paper_width_mm')->nullable()->after('a4_template');
            }
            if (! Schema::hasColumn('settings', 'print_margin_top_mm')) {
                $table->integer('print_margin_top_mm')->default(0)->after('print_paper_width_mm');
            }
            if (! Schema::hasColumn('settings', 'print_margin_bottom_mm')) {
                $table->integer('print_margin_bottom_mm')->default(4)->after('print_margin_top_mm');
            }
            if (! Schema::hasColumn('settings', 'print_margin_left_mm')) {
                $table->integer('print_margin_left_mm')->default(0)->after('print_margin_bottom_mm');
            }
            if (! Schema::hasColumn('settings', 'print_margin_right_mm')) {
                $table->integer('print_margin_right_mm')->default(0)->after('print_margin_left_mm');
            }
            if (! Schema::hasColumn('settings', 'print_font_scale')) {
                $table->integer('print_font_scale')->default(100)->after('print_margin_right_mm');
            }
            if (! Schema::hasColumn('settings', 'print_contrast_mode')) {
                $table->string('print_contrast_mode', 24)->default('standard')->after('print_font_scale');
            }
            if (! Schema::hasColumn('settings', 'print_scale_mode')) {
                $table->string('print_scale_mode', 20)->default('auto')->after('print_contrast_mode');
            }
            if (! Schema::hasColumn('settings', 'print_show_logo')) {
                $table->boolean('print_show_logo')->default(true)->after('print_scale_mode');
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('settings')) {
            return;
        }

        Schema::table('settings', function (Blueprint $table) {
            $columns = array_filter([
                'print_paper_width_mm',
                'print_margin_top_mm',
                'print_margin_bottom_mm',
                'print_margin_left_mm',
                'print_margin_right_mm',
                'print_font_scale',
                'print_contrast_mode',
                'print_scale_mode',
                'print_show_logo',
            ], fn (string $col) => Schema::hasColumn('settings', $col));

            if (! empty($columns)) {
                $table->dropColumn($columns);
            }
        });
    }
};
