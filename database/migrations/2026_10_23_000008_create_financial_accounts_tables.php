<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (!Schema::hasTable('accounts')) {
            Schema::create('accounts', function (Blueprint $table) {
                $table->id();
                $table->string('name', 100);
                $table->string('type', 50)->default('bank')->index(); // cash, bank, card, mobile_wallet, other
                $table->string('bank_name', 100)->nullable();
                $table->string('account_number', 100)->nullable();
                $table->decimal('opening_balance', 15, 2)->default(0);
                $table->decimal('current_balance', 15, 2)->default(0);
                $table->boolean('is_active')->default(true)->index();
                $table->boolean('is_default')->default(false)->index();
                $table->text('notes')->nullable();
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('account_transactions')) {
            Schema::create('account_transactions', function (Blueprint $table) {
                $table->id();
                $table->foreignId('account_id')->constrained('accounts')->cascadeOnDelete();
                $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
                $table->string('type', 50)->index(); // deposit, withdrawal, transfer_in, transfer_out, opening_balance, adjustment
                $table->decimal('amount', 15, 2);
                $table->decimal('balance_after', 15, 2)->default(0);
                $table->string('reference_type', 100)->nullable();
                $table->unsignedBigInteger('reference_id')->nullable()->index();
                $table->string('description', 255)->nullable();
                $table->dateTime('transaction_date')->index();
                $table->timestamps();

                $table->index(['account_id', 'transaction_date']);
                $table->index(['reference_type', 'reference_id']);
            });
        }

        // Add account_id to financial documents if not present
        if (Schema::hasTable('sale_invoices') && !Schema::hasColumn('sale_invoices', 'account_id')) {
            Schema::table('sale_invoices', function (Blueprint $table) {
                $table->unsignedBigInteger('account_id')->nullable()->after('payment_method')->index();
            });
        }

        if (Schema::hasTable('purchase_invoices') && !Schema::hasColumn('purchase_invoices', 'account_id')) {
            Schema::table('purchase_invoices', function (Blueprint $table) {
                $table->unsignedBigInteger('account_id')->nullable()->after('payment_method')->index();
            });
        }

        if (Schema::hasTable('payments') && !Schema::hasColumn('payments', 'account_id')) {
            Schema::table('payments', function (Blueprint $table) {
                $table->unsignedBigInteger('account_id')->nullable()->after('payment_method')->index();
            });
        }

        if (Schema::hasTable('sale_returns') && !Schema::hasColumn('sale_returns', 'account_id')) {
            $hasPaymentMethod = Schema::hasColumn('sale_returns', 'payment_method');
            Schema::table('sale_returns', function (Blueprint $table) use ($hasPaymentMethod) {
                $col = $table->unsignedBigInteger('account_id')->nullable();
                if ($hasPaymentMethod) {
                    $col->after('payment_method');
                }
                $col->index();
            });
        }

        if (Schema::hasTable('purchase_returns') && !Schema::hasColumn('purchase_returns', 'account_id')) {
            $hasPaymentMethod = Schema::hasColumn('purchase_returns', 'payment_method');
            Schema::table('purchase_returns', function (Blueprint $table) use ($hasPaymentMethod) {
                $col = $table->unsignedBigInteger('account_id')->nullable();
                if ($hasPaymentMethod) {
                    $col->after('payment_method');
                }
                $col->index();
            });
        }

        // Seed only Cash in Hand (Drawer) by default; users create additional accounts on demand
        if (Schema::hasTable('accounts') && DB::table('accounts')->count() === 0) {
            $now = now();
            DB::table('accounts')->insert([
                [
                    'name'            => 'Cash in Hand (Drawer)',
                    'type'            => 'cash',
                    'bank_name'       => null,
                    'account_number'  => null,
                    'opening_balance' => 0,
                    'current_balance' => 0,
                    'is_active'       => true,
                    'is_default'      => true,
                    'notes'           => 'Primary cash counter / drawer balance',
                    'created_at'      => $now,
                    'updated_at'      => $now,
                ],
            ]);
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('sale_invoices') && Schema::hasColumn('sale_invoices', 'account_id')) {
            Schema::table('sale_invoices', function (Blueprint $table) {
                $table->dropColumn('account_id');
            });
        }

        if (Schema::hasTable('purchase_invoices') && Schema::hasColumn('purchase_invoices', 'account_id')) {
            Schema::table('purchase_invoices', function (Blueprint $table) {
                $table->dropColumn('account_id');
            });
        }

        if (Schema::hasTable('payments') && Schema::hasColumn('payments', 'account_id')) {
            Schema::table('payments', function (Blueprint $table) {
                $table->dropColumn('account_id');
            });
        }

        if (Schema::hasTable('sale_returns') && Schema::hasColumn('sale_returns', 'account_id')) {
            Schema::table('sale_returns', function (Blueprint $table) {
                $table->dropColumn('account_id');
            });
        }

        if (Schema::hasTable('purchase_returns') && Schema::hasColumn('purchase_returns', 'account_id')) {
            Schema::table('purchase_returns', function (Blueprint $table) {
                $table->dropColumn('account_id');
            });
        }

        Schema::dropIfExists('account_transactions');
        Schema::dropIfExists('accounts');
    }
};

