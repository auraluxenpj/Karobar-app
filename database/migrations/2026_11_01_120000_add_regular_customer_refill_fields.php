<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('customers')) {
            Schema::table('customers', function (Blueprint $table) {
                if (!Schema::hasColumn('customers', 'is_regular')) {
                    $table->boolean('is_regular')->default(false)->index();
                }
                if (!Schema::hasColumn('customers', 'refill_cycle')) {
                    $table->string('refill_cycle', 20)->nullable()->default('monthly'); // weekly | biweekly | monthly | custom
                }
                if (!Schema::hasColumn('customers', 'refill_custom_days')) {
                    $table->unsignedSmallInteger('refill_custom_days')->nullable();
                }
                if (!Schema::hasColumn('customers', 'reminder_lead_days')) {
                    $table->unsignedSmallInteger('reminder_lead_days')->default(2);
                }
                if (!Schema::hasColumn('customers', 'next_refill_date')) {
                    $table->date('next_refill_date')->nullable()->index();
                }
                if (!Schema::hasColumn('customers', 'last_refill_reminded_at')) {
                    $table->timestamp('last_refill_reminded_at')->nullable();
                }
                if (!Schema::hasColumn('customers', 'last_refill_collected_at')) {
                    $table->timestamp('last_refill_collected_at')->nullable();
                }
                if (!Schema::hasColumn('customers', 'reminder_language')) {
                    $table->string('reminder_language', 16)->default('english'); // english | urdu
                }
                if (!Schema::hasColumn('customers', 'regular_notes')) {
                    $table->text('regular_notes')->nullable();
                }
            });
        }

        if (!Schema::hasTable('customer_regular_items')) {
            Schema::create('customer_regular_items', function (Blueprint $table) {
                $table->id();
                $table->foreignId('customer_id')->constrained('customers')->cascadeOnDelete();
                $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
                $table->unsignedInteger('pack_quantity')->default(0);
                $table->unsignedInteger('unit_quantity')->default(1);
                $table->string('dosage_notes', 255)->nullable();
                $table->timestamps();

                $table->index(['customer_id', 'product_id']);
            });
        } else {
            Schema::table('customer_regular_items', function (Blueprint $table) {
                if (!Schema::hasColumn('customer_regular_items', 'pack_quantity')) {
                    $table->unsignedInteger('pack_quantity')->default(0);
                }
                if (!Schema::hasColumn('customer_regular_items', 'unit_quantity')) {
                    $table->unsignedInteger('unit_quantity')->default(1);
                }
                if (!Schema::hasColumn('customer_regular_items', 'dosage_notes')) {
                    $table->string('dosage_notes', 255)->nullable();
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('customer_regular_items')) {
            Schema::dropIfExists('customer_regular_items');
        }

        if (Schema::hasTable('customers')) {
            Schema::table('customers', function (Blueprint $table) {
                $columns = [
                    'is_regular',
                    'refill_cycle',
                    'refill_custom_days',
                    'reminder_lead_days',
                    'next_refill_date',
                    'last_refill_reminded_at',
                    'last_refill_collected_at',
                    'reminder_language',
                    'regular_notes',
                ];
                foreach ($columns as $col) {
                    if (Schema::hasColumn('customers', $col)) {
                        $table->dropColumn($col);
                    }
                }
            });
        }
    }
};

