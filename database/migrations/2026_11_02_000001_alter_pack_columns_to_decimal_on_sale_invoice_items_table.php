<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('sale_invoice_items')) {
            return;
        }

        Schema::table('sale_invoice_items', function (Blueprint $table) {
            if (Schema::hasColumn('sale_invoice_items', 'pack_quantity')) {
                $table->decimal('pack_quantity', 15, 2)->default(0)->nullable()->change();
            }
            if (Schema::hasColumn('sale_invoice_items', 'pack_bonus')) {
                $table->decimal('pack_bonus', 15, 2)->default(0)->nullable()->change();
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('sale_invoice_items')) {
            return;
        }

        Schema::table('sale_invoice_items', function (Blueprint $table) {
            if (Schema::hasColumn('sale_invoice_items', 'pack_quantity')) {
                $table->integer('pack_quantity')->default(0)->nullable()->change();
            }
            if (Schema::hasColumn('sale_invoice_items', 'pack_bonus')) {
                $table->integer('pack_bonus')->default(0)->nullable()->change();
            }
        });
    }
};

