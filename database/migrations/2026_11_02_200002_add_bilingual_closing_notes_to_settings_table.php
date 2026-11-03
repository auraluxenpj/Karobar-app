<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('settings', function (Blueprint $table) {
            if (! Schema::hasColumn('settings', 'note_en')) {
                $table->text('note_en')->nullable()->after('note');
            }
            if (! Schema::hasColumn('settings', 'note_ur')) {
                $table->text('note_ur')->nullable()->after('note_en');
            }
        });
    }

    public function down(): void
    {
        Schema::table('settings', function (Blueprint $table) {
            $columns = array_filter([
                'note_en',
                'note_ur',
            ], fn (string $col) => Schema::hasColumn('settings', $col));

            if (! empty($columns)) {
                $table->dropColumn($columns);
            }
        });
    }
};

