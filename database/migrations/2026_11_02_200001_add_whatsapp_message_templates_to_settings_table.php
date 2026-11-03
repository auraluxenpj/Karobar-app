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
            if (! Schema::hasColumn('settings', 'whatsapp_message_en')) {
                $table->text('whatsapp_message_en')->nullable()->after('note_ur');
            }
            if (! Schema::hasColumn('settings', 'whatsapp_message_ur')) {
                $table->text('whatsapp_message_ur')->nullable()->after('whatsapp_message_en');
            }
        });
    }

    public function down(): void
    {
        Schema::table('settings', function (Blueprint $table) {
            $columns = array_filter([
                'note_en',
                'note_ur',
                'whatsapp_message_en',
                'whatsapp_message_ur',
            ], fn (string $col) => Schema::hasColumn('settings', $col));

            if (! empty($columns)) {
                $table->dropColumn($columns);
            }
        });
    }
};

