<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class SupplierLedger extends Model
{
    use HasFactory;

    protected $fillable = [
        'supplier_id',
        'purchase_invoice_id',
        'purchase_return_id',
        'payment_id',
        'entry_type',          // 'invoice' | 'payment' | 'manual'
        'entry_date',
        'due_date',
        'posted_number',
        'invoice_number',
        'invoice_total',
        'total_paid',
        'debited_amount',      // payments
        'payment_ref',
        'credit_remaining',
        'description',
        'is_manual',
        'created_by',
    ];

    protected $casts = [
        'entry_date'        => 'date',
        'due_date'          => 'date',
        'invoice_total'     => 'decimal:2',
        'total_paid'        => 'decimal:2',
        'debited_amount'    => 'decimal:2',
        'credit_remaining'  => 'decimal:2',
        'is_manual'         => 'boolean',
    ];

    public function supplier()
    {
        return $this->belongsTo(Supplier::class);
    }

    public function purchaseInvoice()
    {
        return $this->belongsTo(PurchaseInvoice::class);
    }

    public function purchaseReturn()
    {
        return $this->belongsTo(PurchaseReturn::class, 'purchase_return_id');
    }

    /**
     * Calculate the supplier's current net payable balance from the ledger
     * (including manual/opening balance rows, credit invoices, and payments).
     */
    public static function getSupplierNetBalance(int $supplierId): float
    {
        $balances = self::getBulkSupplierNetBalances([$supplierId]);
        return $balances[$supplierId] ?? 0.0;
    }

    /**
     * Calculate net payable balances for multiple suppliers in bulk (eliminates N+1 loops).
     *
     * @param  array<int, int>  $supplierIds
     * @return array<int, float>
     */
    public static function getBulkSupplierNetBalances(array $supplierIds): array
    {
        $supplierIds = array_values(array_unique(array_filter(array_map('intval', $supplierIds))));
        if (empty($supplierIds)) {
            return [];
        }

        $rowsBySupplier = self::with(['purchaseInvoice:id,invoice_number,posted_number,total_amount,total_paid,status'])
            ->whereIn('supplier_id', $supplierIds)
            ->get()
            ->groupBy('supplier_id');

        $allLinkedInvIds = [];
        foreach ($rowsBySupplier as $sRows) {
            foreach ($sRows as $r) {
                if (!empty($r->purchase_invoice_id)) {
                    $allLinkedInvIds[(int) $r->purchase_invoice_id] = (int) $r->purchase_invoice_id;
                }
            }
        }

        $unlinkedBySupplier = PurchaseInvoice::query()
            ->whereIn('supplier_id', $supplierIds)
            ->where('invoice_type', 'credit')
            ->where(function ($q) {
                $q->whereNull('status')->orWhere('status', '!=', 'reversed');
            })
            ->get(['id', 'supplier_id', 'total_amount', 'total_paid'])
            ->reject(fn ($inv) => isset($allLinkedInvIds[(int) $inv->id]))
            ->groupBy('supplier_id');

        $allInvIdsForAlloc = $allLinkedInvIds;
        foreach ($unlinkedBySupplier as $uList) {
            foreach ($uList as $uInv) {
                $allInvIdsForAlloc[(int) $uInv->id] = (int) $uInv->id;
            }
        }

        $allocatedByInvoice = PaymentAllocation::sumAllocatedByInvoiceIds('purchase_invoice', array_values($allInvIdsForAlloc));

        $result = [];
        foreach ($supplierIds as $supplierId) {
            $rows = $rowsBySupplier->get($supplierId, collect());
            $totalInvoiced = 0.0;
            $paidOnInvoice = 0.0;
            $paymentsDebited = 0.0;

            foreach ($rows as $row) {
                if ($row->entry_type === 'invoice' && $row->purchaseInvoice) {
                    $inv = $row->purchaseInvoice;
                    if (($inv->status ?? null) === 'reversed') {
                        continue;
                    }
                    $invTotal = (float) ($inv->total_amount ?? $row->invoice_total ?? 0);
                    $rawPaid = (float) ($inv->total_paid ?? $row->total_paid ?? 0);
                    $allocated = (float) ($allocatedByInvoice[$inv->id] ?? 0);
                    $paidOnInv = max(0.0, min($rawPaid - $allocated, $invTotal));

                    $totalInvoiced += $invTotal;
                    $paidOnInvoice += $paidOnInv;
                } elseif (in_array($row->entry_type, ['invoice', 'manual'], true)) {
                    $invTotal = (float) ($row->invoice_total ?? 0);
                    $paidOnInv = min((float) ($row->total_paid ?? 0), $invTotal);

                    $totalInvoiced += $invTotal;
                    $paidOnInvoice += $paidOnInv;
                } elseif ($row->entry_type === 'payment') {
                    $paymentsDebited += (float) ($row->debited_amount ?? 0);
                }
            }

            $unlinkedInvoices = $unlinkedBySupplier->get($supplierId, collect());
            foreach ($unlinkedInvoices as $uInv) {
                $uTotal = (float) ($uInv->total_amount ?? 0);
                $uRawPaid = (float) ($uInv->total_paid ?? 0);
                $uAlloc = (float) ($allocatedByInvoice[$uInv->id] ?? 0);
                $uPaidOnInv = max(0.0, min($uRawPaid - $uAlloc, $uTotal));

                $totalInvoiced += $uTotal;
                $paidOnInvoice += $uPaidOnInv;
            }

            $netBalance = ($totalInvoiced - $paidOnInvoice) - $paymentsDebited;
            $result[$supplierId] = $netBalance > 0 ? round($netBalance, 2) : 0.0;
        }

        return $result;
    }
}
