<?php

namespace App\Services;

use App\Models\Product;
use App\Models\SaleInvoice;
use App\Models\User;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class InvoiceCalculationService
{
    /**
     * Resolve the user authorizing an override (either the current user or a supervisor whose credentials were supplied).
     */
    public function resolveAuthorizingUser(?User $currentUser, array $data = [], ?string $permission = null): ?User
    {
        $supervisorPassword = (string) ($data['supervisor_password'] ?? '');
        $supervisorEmail = trim((string) ($data['supervisor_email'] ?? ''));

        if ($supervisorPassword !== '') {
            if ($supervisorEmail !== '') {
                $supervisor = User::where('email', $supervisorEmail)->first();
                if ($supervisor && ($supervisor->status ?? 'active') === 'active' && Hash::check($supervisorPassword, $supervisor->password)) {
                    return $supervisor;
                }
            } else {
                $candidates = User::query()->get()->filter(function (User $u) use ($permission) {
                    if (($u->status ?? 'active') !== 'active') {
                        return false;
                    }
                    if ($u->hasRole('Admin') || $u->hasRole('admin') || $u->hasRole('super-admin')) {
                        return true;
                    }
                    return $permission ? $u->can($permission) : false;
                });

                foreach ($candidates as $candidate) {
                    if (Hash::check($supervisorPassword, $candidate->password)) {
                        return $candidate;
                    }
                }
            }
        }

        return $currentUser;
    }

    /**
     * Check whether the user is authorized to override discount limits.
     */
    public function canOverrideDiscount(?User $user): bool
    {
        if (!$user) {
            return false;
        }

        if ($user->hasRole('Admin') || $user->hasRole('admin') || $user->hasRole('super-admin')) {
            return true;
        }

        return $user->can('sale-invoice.discount-override');
    }

    /**
     * Check whether the user is authorized to override customer credit limits / holds.
     */
    public function canOverrideCredit(?User $user): bool
    {
        if (!$user) {
            return false;
        }

        if ($user->hasRole('Admin') || $user->hasRole('admin') || $user->hasRole('super-admin')) {
            return true;
        }

        return $user->can('sale-invoice.credit-override');
    }

    /**
     * Authoritatively recalculate and validate a Sale Invoice payload.
     *
     * Line subtotals, gross amount, item discounts, bill discounts, taxes, and final totals
     * are computed independently server-side, protecting against malicious or desynced client payloads.
     *
     * @param array $data Raw request data
     * @param User|null $user Authenticated user
     * @param bool $discountOverride Whether supervisor discount override was passed
     * @return array Calculated payload ready for storage
     *
     * @throws HttpResponseException|ValidationException
     */
    public function calculateAndValidateSale(array $data, ?User $user = null, bool $discountOverride = false): array
    {
        $items = $data['items'] ?? [];
        if (empty($items) || !is_array($items)) {
            throw ValidationException::withMessages(['items' => ['At least one item is required.']]);
        }

        $authorizingUser = $this->resolveAuthorizingUser($user, $data, 'sale-invoice.discount-override');
        $productIds = collect($items)->pluck('product_id')->filter()->unique();
        $products = Product::whereIn('id', $productIds)->get()->keyBy('id');

        $calculatedItems = [];
        $grossSum = 0.0;
        $itemDiscSum = 0.0;
        $invoiceSaleType = $data['sale_type'] ?? 'retail';

        foreach ($items as $idx => $raw) {
            $productId = (int)($raw['product_id'] ?? 0);
            $product = $products->get($productId);
            if (!$product) {
                throw ValidationException::withMessages([
                    "items.{$idx}.product_id" => ["Product #{$productId} not found."],
                ]);
            }

            $itemSaleType = $raw['sale_type'] ?? $invoiceSaleType;
            $packSize = max(1, (int)($raw['pack_size'] ?? ($product->pack_size ?: 1)));
            $packQty = max(0.0, (float)($raw['pack_quantity'] ?? 0));
            $unitQty = max(0, (int) round((float)($raw['unit_quantity'] ?? 0)));
            $packBonus = max(0.0, (float)($raw['pack_bonus'] ?? 0));
            $unitBonus = max(0, (int) round((float)($raw['unit_bonus'] ?? 0)));
            $bonusQty = max(0, (int) round((float)($raw['bonus'] ?? 0)));

            if ($unitBonus > 0 && ($bonusQty < 1 || $bonusQty === $unitBonus)) {
                $bonusQty = $unitBonus;
                $packBonus = round($bonusQty / $packSize, 2);
            } elseif ($packBonus > 0 && ($bonusQty < 1 || $bonusQty === (int) round($packBonus * $packSize))) {
                $bonusQty = (int) round($packBonus * $packSize);
                $unitBonus = $bonusQty;
                $packBonus = round($bonusQty / $packSize, 2);
            } elseif ($bonusQty > 0) {
                $unitBonus = $bonusQty;
                $packBonus = round($bonusQty / $packSize, 2);
            }

            $qty = max(0, (int) round((float)($raw['quantity'] ?? 0)));
            if ($itemSaleType === 'wholesale') {
                if ($unitQty > 0 && ($qty < 1 || $qty === $unitQty)) {
                    $qty = $unitQty;
                    $packQty = round($qty / $packSize, 2);
                } elseif ($packQty > 0 && ($qty < 1 || $qty === (int) round($packQty * $packSize))) {
                    $qty = (int) round($packQty * $packSize);
                    $unitQty = $qty;
                    $packQty = round($qty / $packSize, 2);
                } elseif ($qty > 0) {
                    $unitQty = $qty;
                    $packQty = round($qty / $packSize, 2);
                }
            } else {
                if ($qty < 1 && $unitQty > 0) {
                    $qty = $unitQty;
                } elseif ($qty < 1 && $packQty > 0) {
                    $qty = (int) round($packQty * $packSize);
                }
            }

            if ($qty < 1) {
                throw ValidationException::withMessages([
                    "items.{$idx}.quantity" => ["Quantity must be at least 1."],
                ]);
            }

            $price = (float)($raw['price'] ?? 0);
            $packPrice = isset($raw['pack_price']) && $raw['pack_price'] !== '' && $raw['pack_price'] !== null
                ? (float)$raw['pack_price']
                : round($price * $packSize, 2);

            if ($price <= 0 && $packPrice > 0 && $packSize > 0) {
                $price = round($packPrice / $packSize, 4);
            }
            if ($price < 0) {
                throw ValidationException::withMessages([
                    "items.{$idx}.price" => ["Price cannot be negative."],
                ]);
            }

            $discPct = (float)($raw['item_discount_percentage'] ?? 0);
            if ($discPct < 0) {
                throw ValidationException::withMessages([
                    "items.{$idx}.item_discount_percentage" => ["Item discount percentage cannot be negative."],
                ]);
            }
            if ($discPct > 100) {
                throw ValidationException::withMessages([
                    "items.{$idx}.item_discount_percentage" => ["Item discount percentage cannot exceed 100%."],
                ]);
            }

            // Maximum Discount Enforcement per Product (explicit item discount + manual price reduction for non-override users)
            $maxDiscount = $product->max_discount !== null ? (float)$product->max_discount : null;
            $catalogPrice = $itemSaleType === 'retail'
                ? (float)($product->unit_sale_price ?? 0)
                : (float)($product->whole_sale_unit_price ?: (($product->whole_sale_pack_price && $packSize > 0) ? ($product->whole_sale_pack_price / $packSize) : 0));
            $effectiveItemDiscPct = $discPct;
            if (!$this->canOverrideDiscount($authorizingUser) && $maxDiscount !== null && $maxDiscount > 0 && $catalogPrice > 0 && $price < $catalogPrice) {
                $effectivePriceAfterItemDisc = $price * (1 - ($discPct / 100));
                $effectiveItemDiscPct = max($discPct, round((($catalogPrice - $effectivePriceAfterItemDisc) / $catalogPrice) * 100, 2));
            }

            if ($maxDiscount !== null && $maxDiscount > 0 && $effectiveItemDiscPct > $maxDiscount) {
                if (!$discountOverride) {
                    throw new HttpResponseException(response()->json([
                        'message' => "Item discount of {$effectiveItemDiscPct}% on product '{$product->name}' exceeds maximum allowed limit of {$maxDiscount}%. Requires supervisor override.",
                        'requires_discount_override' => true,
                        'product_id' => $product->id,
                        'product_name' => $product->name,
                        'max_discount' => $maxDiscount,
                        'requested_discount' => $effectiveItemDiscPct,
                        'item_index' => $idx,
                        'errors' => [
                            "items.{$idx}.item_discount_percentage" => [
                                "Item discount of {$effectiveItemDiscPct}% exceeds maximum allowed limit of {$maxDiscount}% for '{$product->name}'."
                            ],
                        ],
                    ], 422));
                }

                // If override was requested, verify user authorization
                if (!$this->canOverrideDiscount($authorizingUser)) {
                    throw new HttpResponseException(response()->json([
                        'message' => 'You do not have permission to override maximum discount limits.',
                        'errors' => [
                            'discount_override' => ['User does not have permission to authorize discount overrides.'],
                        ],
                    ], 403));
                }
            }

            // Server-authoritative line item subtotal calculation
            $lineGross = round($qty * $price, 2);
            $lineDiscAmt = round(($lineGross * $discPct) / 100, 2);
            $lineSubTotal = round($lineGross - $lineDiscAmt, 2);

            // Prevent saving wholesale sale items with negative margin (< 0%) based on avg_price (fallback unit_purchase_price)
            $unitCost = (float)($product->avg_price ?? 0) > 0
                ? (float)$product->avg_price
                : (float)($product->unit_purchase_price ?: (($product->pack_purchase_price && $packSize > 0) ? ($product->pack_purchase_price / $packSize) : 0));

            if (($itemSaleType === 'wholesale' || $invoiceSaleType === 'wholesale') && $unitCost > 0) {
                $effectiveUnitPrice = $price * (1 - ($discPct / 100));
                $totalOutUnits = $qty + $bonusQty;
                $totalLineCost = round($totalOutUnits * $unitCost, 2);
                if ($effectiveUnitPrice < $unitCost - 0.005 || $lineSubTotal < $totalLineCost - 0.05) {
                    throw ValidationException::withMessages([
                        "items.{$idx}.price" => [
                            "Margin for '{$product->name}' cannot be less than 0% (Net sale: {$lineSubTotal}, Cost: {$totalLineCost} at avg cost " . round($unitCost, 2) . "/unit)."
                        ],
                    ]);
                }
            }

            $grossSum += $lineGross;
            $itemDiscSum += $lineDiscAmt;

            $calculatedItem = $raw;
            $calculatedItem['product_id'] = $productId;
            $calculatedItem['pack_size'] = $packSize;
            $calculatedItem['pack_quantity'] = $packQty;
            $calculatedItem['unit_quantity'] = $unitQty;
            $calculatedItem['quantity'] = $qty;
            $calculatedItem['pack_bonus'] = $packBonus;
            $calculatedItem['unit_bonus'] = $unitBonus;
            $calculatedItem['bonus'] = $bonusQty;
            $calculatedItem['pack_price'] = round($packPrice, 2);
            $calculatedItem['price'] = $price;
            $calculatedItem['sale_type'] = $itemSaleType;
            $calculatedItem['item_discount_percentage'] = $discPct;
            $calculatedItem['sub_total'] = $lineSubTotal;
            $calculatedItem['_line_gross'] = $lineGross;
            $calculatedItem['_line_discount'] = $lineDiscAmt;

            $calculatedItems[] = $calculatedItem;
        }

        $grossSum = round($grossSum, 2);
        $itemDiscSum = round($itemDiscSum, 2);

        // Bill / Overall Discount Calculation (Amount takes precedence if explicitly passed, matching Formula/SaleInvoice.js)
        $billDiscPct = 0.0;
        $billDiscAmt = 0.0;

        if (isset($data['discount_amount']) && $data['discount_amount'] !== '' && (float)$data['discount_amount'] != 0) {
            $billDiscAmt = (float)$data['discount_amount'];
            if ($billDiscAmt < 0) {
                throw ValidationException::withMessages(['discount_amount' => ['Discount amount cannot be negative.']]);
            }
            $billDiscPct = $grossSum > 0 ? round(($billDiscAmt / $grossSum) * 100, 2) : 0.0;
        } elseif (isset($data['discount_percentage']) && $data['discount_percentage'] !== '' && (float)$data['discount_percentage'] != 0) {
            $billDiscPct = (float)$data['discount_percentage'];
            if ($billDiscPct < 0 || $billDiscPct > 100) {
                throw ValidationException::withMessages(['discount_percentage' => ['Discount percentage must be between 0 and 100.']]);
            }
            $billDiscAmt = round(($grossSum * $billDiscPct) / 100, 2);
        }

        // Cap bill discount so taxable base cannot drop below 0
        $maxAllowedBillDisc = max(0.0, $grossSum - $itemDiscSum);
        if ($billDiscAmt > $maxAllowedBillDisc) {
            $billDiscAmt = $maxAllowedBillDisc;
            $billDiscPct = $grossSum > 0 ? round(($billDiscAmt / $grossSum) * 100, 2) : 0.0;
        }

        // Enforce combined (item + bill-level) discount against product max_discount for non-override users
        if ($billDiscAmt > 0 && $grossSum > 0 && !$this->canOverrideDiscount($authorizingUser)) {
            foreach ($calculatedItems as $idx => $calcItem) {
                $product = $products->get($calcItem['product_id']);
                $maxDiscount = ($product && $product->max_discount !== null) ? (float)$product->max_discount : null;
                if ($maxDiscount !== null && $maxDiscount > 0) {
                    $combinedPct = round((float)$calcItem['item_discount_percentage'] + $billDiscPct, 2);
                    if ($combinedPct > $maxDiscount) {
                        if (!$discountOverride) {
                            throw new HttpResponseException(response()->json([
                                'message' => "Combined discount of {$combinedPct}% on product '{$product->name}' exceeds maximum allowed limit of {$maxDiscount}%. Requires supervisor override.",
                                'requires_discount_override' => true,
                                'product_id' => $product->id,
                                'product_name' => $product->name,
                                'max_discount' => $maxDiscount,
                                'requested_discount' => $combinedPct,
                                'item_index' => $idx,
                                'errors' => [
                                    'discount_amount' => [
                                        "Combined discount of {$combinedPct}% exceeds maximum allowed limit of {$maxDiscount}% for '{$product->name}'."
                                    ],
                                ],
                            ], 422));
                        }

                        throw new HttpResponseException(response()->json([
                            'message' => 'You do not have permission to override maximum discount limits.',
                            'errors' => [
                                'discount_override' => ['User does not have permission to authorize discount overrides.'],
                            ],
                        ], 403));
                    }
                }
            }
        }

        // Taxable Base
        $taxableBase = max(0.0, $grossSum - $itemDiscSum - $billDiscAmt);

        // Tax Calculation (Amount takes precedence if explicitly passed, matching Formula/SaleInvoice.js)
        $taxPct = 0.0;
        $taxAmt = 0.0;

        if (isset($data['tax_amount']) && $data['tax_amount'] !== '' && (float)$data['tax_amount'] != 0) {
            $taxAmt = (float)$data['tax_amount'];
            if ($taxAmt < 0) {
                throw ValidationException::withMessages(['tax_amount' => ['Tax amount cannot be negative.']]);
            }
            $taxPct = $taxableBase > 0 ? round(($taxAmt / $taxableBase) * 100, 2) : 0.0;
        } elseif (isset($data['tax_percentage']) && $data['tax_percentage'] !== '' && (float)$data['tax_percentage'] != 0) {
            $taxPct = (float)$data['tax_percentage'];
            if ($taxPct < 0 || $taxPct > 100) {
                throw ValidationException::withMessages(['tax_percentage' => ['Tax percentage must be between 0 and 100.']]);
            }
            $taxAmt = round(($taxableBase * $taxPct) / 100, 2);
        }

        // Final Authoritative Total (integer rounded matching POS UI Formula/SaleInvoice.js)
        $totalFloat = $taxableBase + $taxAmt;
        $total = (float)round($totalFloat);

        // Strip internal calculation metadata
        foreach ($calculatedItems as &$it) {
            unset($it['_line_gross'], $it['_line_discount']);
        }
        unset($it);

        return [
            'items'               => $calculatedItems,
            'gross_amount'        => $grossSum,
            'item_discount'       => $itemDiscSum,
            'discount_percentage' => $billDiscPct,
            'discount_amount'     => $billDiscAmt,
            'tax_percentage'      => $taxPct,
            'tax_amount'          => $taxAmt,
            'total'               => $total,
        ];
    }

    /**
     * Authoritatively recalculate and validate a Purchase Invoice payload.
     *
     * @param array $data Raw request data
     * @param User|null $user Authenticated user
     * @return array Calculated payload ready for storage
     *
     * @throws ValidationException
     */
    public function calculateAndValidatePurchase(array $data, ?User $user = null): array
    {
        $items = $data['items'] ?? [];
        if (empty($items) || !is_array($items)) {
            throw ValidationException::withMessages(['items' => ['At least one item is required.']]);
        }

        $calculatedItems = [];
        $rowsTotal = 0.0;

        foreach ($items as $idx => $raw) {
            $packSize = (int)($raw['pack_size'] ?? 0);
            $packQty = (float)($raw['pack_quantity'] ?? 0);
            $unitQty = (int)($raw['unit_quantity'] ?? 0);
            $packPurchasePrice = (float)($raw['pack_purchase_price'] ?? 0);
            $unitPurchasePrice = (float)($raw['unit_purchase_price'] ?? 0);
            $packBonus = (float)($raw['pack_bonus'] ?? 0);
            $unitBonus = (int)($raw['unit_bonus'] ?? 0);
            $discPct = (float)($raw['item_discount_percentage'] ?? 0);

            if ($packQty < 0) {
                throw ValidationException::withMessages([
                    "items.{$idx}.pack_quantity" => ["Pack quantity cannot be negative."],
                ]);
            }
            if ($unitQty < 0) {
                throw ValidationException::withMessages([
                    "items.{$idx}.unit_quantity" => ["Unit quantity cannot be negative."],
                ]);
            }
            if ($packBonus < 0) {
                throw ValidationException::withMessages([
                    "items.{$idx}.pack_bonus" => ["Pack bonus cannot be negative."],
                ]);
            }
            if ($unitBonus < 0) {
                throw ValidationException::withMessages([
                    "items.{$idx}.unit_bonus" => ["Unit bonus cannot be negative."],
                ]);
            }
            if ($packPurchasePrice < 0) {
                throw ValidationException::withMessages([
                    "items.{$idx}.pack_purchase_price" => ["Pack purchase price cannot be negative."],
                ]);
            }
            if ($unitPurchasePrice < 0) {
                throw ValidationException::withMessages([
                    "items.{$idx}.unit_purchase_price" => ["Unit purchase price cannot be negative."],
                ]);
            }
            if ($discPct < 0 || $discPct > 100) {
                throw ValidationException::withMessages([
                    "items.{$idx}.item_discount_percentage" => ["Discount percentage must be between 0 and 100."],
                ]);
            }

            // Two-way sync if pack_size is present
            if ($packSize > 0) {
                if ($unitQty <= 0 && $packQty > 0) {
                    $unitQty = (int)round($packQty * $packSize);
                } elseif ($packQty <= 0 && $unitQty > 0) {
                    $packQty = round($unitQty / $packSize, 2);
                }

                if ($unitPurchasePrice <= 0 && $packPurchasePrice > 0) {
                    $unitPurchasePrice = round($packPurchasePrice / $packSize, 4);
                } elseif ($packPurchasePrice <= 0 && $unitPurchasePrice > 0) {
                    $packPurchasePrice = round($unitPurchasePrice * $packSize, 2);
                }

                if ($unitBonus <= 0 && $packBonus > 0) {
                    $unitBonus = (int)round($packBonus * $packSize);
                } elseif ($packBonus <= 0 && $unitBonus > 0) {
                    $packBonus = round($unitBonus / $packSize, 2);
                }
            }

            // Server calculation matching Formula/PurchaseInvoice.js
            $totalUnits = $unitQty + $unitBonus;
            if (!empty($raw['quantity']) && (int)$raw['quantity'] !== $totalUnits) {
                throw ValidationException::withMessages([
                    "items.{$idx}.quantity" => ["Stock quantity must equal paid units plus bonus units."],
                ]);
            }
            $subTotal = round($unitQty * $unitPurchasePrice, 2);
            $discountAmount = round(($subTotal * $discPct) / 100, 2);
            $netTotal = round($subTotal - $discountAmount, 2);
            $avgPrice = $totalUnits > 0 ? round($netTotal / $totalUnits, 4) : 0.0;

            $rowsTotal += $netTotal;

            $calculatedItem = $raw;
            $calculatedItem['pack_size'] = $packSize;
            $calculatedItem['pack_quantity'] = $packQty;
            $calculatedItem['unit_quantity'] = $unitQty;
            $calculatedItem['pack_purchase_price'] = $packPurchasePrice;
            $calculatedItem['unit_purchase_price'] = $unitPurchasePrice;
            $calculatedItem['pack_bonus'] = $packBonus;
            $calculatedItem['unit_bonus'] = $unitBonus;
            $calculatedItem['quantity'] = $totalUnits;
            $calculatedItem['sub_total'] = $netTotal;
            $calculatedItem['avg_price'] = $avgPrice;

            $calculatedItems[] = $calculatedItem;
        }

        $rowsTotal = round($rowsTotal, 2);

        // Bill Discount (Amount takes precedence if explicitly passed)
        $billDiscPct = 0.0;
        $billDiscAmt = 0.0;

        if (isset($data['discount_amount']) && $data['discount_amount'] !== '' && (float)$data['discount_amount'] != 0) {
            $billDiscAmt = (float)$data['discount_amount'];
            $billDiscPct = $rowsTotal > 0 ? round(($billDiscAmt / $rowsTotal) * 100, 2) : 0.0;
        } elseif (isset($data['discount_percentage']) && $data['discount_percentage'] !== '' && (float)$data['discount_percentage'] != 0) {
            $billDiscPct = (float)$data['discount_percentage'];
            $billDiscAmt = round(($rowsTotal * $billDiscPct) / 100, 2);
        }

        if ($billDiscAmt > $rowsTotal) {
            $billDiscAmt = $rowsTotal;
            $billDiscPct = 100.0;
        }

        $afterDiscount = round($rowsTotal - $billDiscAmt, 2);

        // Tax (Amount takes precedence if explicitly passed)
        $taxPct = 0.0;
        $taxAmt = 0.0;

        if (isset($data['tax_amount']) && $data['tax_amount'] !== '' && (float)$data['tax_amount'] != 0) {
            $taxAmt = (float)$data['tax_amount'];
            $taxPct = $afterDiscount > 0 ? round(($taxAmt / $afterDiscount) * 100, 2) : 0.0;
        } elseif (isset($data['tax_percentage']) && $data['tax_percentage'] !== '' && (float)$data['tax_percentage'] != 0) {
            $taxPct = (float)$data['tax_percentage'];
            $taxAmt = round(($afterDiscount * $taxPct) / 100, 2);
        }

        $totalAmount = round($afterDiscount + $taxAmt, 2);

        $clientTotalMatches = isset($data['total_amount'])
            && is_numeric($data['total_amount'])
            && abs((float)$data['total_amount'] - $totalAmount) < 1.0;
        $invoiceAmount = ($clientTotalMatches && isset($data['invoice_amount']) && is_numeric($data['invoice_amount']) && (float)$data['invoice_amount'] >= 0)
            ? round((float)$data['invoice_amount'], 2)
            : $rowsTotal;

        return [
            'items'               => $calculatedItems,
            'invoice_amount'      => $invoiceAmount,
            'discount_percentage' => $billDiscPct,
            'discount_amount'     => $billDiscAmt,
            'tax_percentage'      => $taxPct,
            'tax_amount'          => $taxAmt,
            'total_amount'        => $totalAmount,
        ];
    }

    /**
     * Authoritatively recalculate and validate a Sale Return payload.
     */
    public function calculateAndValidateSaleReturn(array $data, ?User $user = null): array
    {
        $items = $data['items'] ?? [];
        if (empty($items) || !is_array($items)) {
            throw ValidationException::withMessages(['items' => ['At least one item is required.']]);
        }

        $sourceInvoice = !empty($data['sale_invoice_id'])
            ? SaleInvoice::with('items')->find($data['sale_invoice_id'])
            : null;

        $calculatedItems = [];
        $rowsTotal = 0.0;

        foreach ($items as $idx => $raw) {
            $returnQty = (int)($raw['unit_return_quantity'] ?? 0);
            $unitPrice = (float)($raw['unit_sale_price'] ?? 0);
            $discPct = (float)($raw['item_discount_percentage'] ?? 0);

            if ($returnQty < 0) {
                throw ValidationException::withMessages([
                    "items.{$idx}.unit_return_quantity" => ['Return quantity cannot be negative.'],
                ]);
            }
            if ($unitPrice < 0) {
                throw ValidationException::withMessages([
                    "items.{$idx}.unit_sale_price" => ['Unit sale price cannot be negative.'],
                ]);
            }
            if ($discPct < 0 || $discPct > 100) {
                throw ValidationException::withMessages([
                    "items.{$idx}.item_discount_percentage" => ['Discount percentage must be between 0 and 100.'],
                ]);
            }

            if ($sourceInvoice && $discPct == 0.0 && !array_key_exists('item_discount_percentage', $raw)) {
                $sourceItem = $sourceInvoice->items->firstWhere('product_id', $raw['product_id'] ?? null);
                if ($sourceItem && (float)$sourceItem->item_discount_percentage > 0) {
                    $discPct = (float)$sourceItem->item_discount_percentage;
                }
            }

            $lineGross = round($returnQty * $unitPrice, 2);
            $lineDiscAmt = round(($lineGross * $discPct) / 100, 2);
            $lineSubTotal = round($lineGross - $lineDiscAmt, 2);

            $rowsTotal += $lineSubTotal;

            $calculatedItem = $raw;
            $calculatedItem['unit_return_quantity'] = $returnQty;
            $calculatedItem['unit_sale_price'] = $unitPrice;
            $calculatedItem['item_discount_percentage'] = $discPct;
            $calculatedItem['sub_total'] = $lineSubTotal;

            $calculatedItems[] = $calculatedItem;
        }

        $rowsTotal = round($rowsTotal, 2);

        $billDiscPct = 0.0;
        $billDiscAmt = 0.0;

        if (isset($data['discount_amount']) && $data['discount_amount'] !== '' && (float)$data['discount_amount'] != 0) {
            $billDiscAmt = max(0.0, (float)$data['discount_amount']);
            $billDiscPct = $rowsTotal > 0 ? round(($billDiscAmt / $rowsTotal) * 100, 2) : 0.0;
        } elseif (isset($data['discount_percentage']) && $data['discount_percentage'] !== '' && (float)$data['discount_percentage'] != 0) {
            $billDiscPct = max(0.0, min(100.0, (float)$data['discount_percentage']));
            $billDiscAmt = round(($rowsTotal * $billDiscPct) / 100, 2);
        }

        if ($billDiscAmt > $rowsTotal) {
            $billDiscAmt = $rowsTotal;
            $billDiscPct = $rowsTotal > 0 ? 100.0 : 0.0;
        }

        $afterDiscount = max(0.0, round($rowsTotal - $billDiscAmt, 2));

        $taxPct = 0.0;
        $taxAmt = 0.0;

        if (isset($data['tax_amount']) && $data['tax_amount'] !== '' && (float)$data['tax_amount'] != 0) {
            $taxAmt = max(0.0, (float)$data['tax_amount']);
            $taxPct = $afterDiscount > 0 ? round(($taxAmt / $afterDiscount) * 100, 2) : 0.0;
        } elseif (isset($data['tax_percentage']) && $data['tax_percentage'] !== '' && (float)$data['tax_percentage'] != 0) {
            $taxPct = max(0.0, min(100.0, (float)$data['tax_percentage']));
            $taxAmt = round(($afterDiscount * $taxPct) / 100, 2);
        }

        $total = round($afterDiscount + $taxAmt, 2);

        return [
            'items'               => $calculatedItems,
            'gross_total'         => $rowsTotal,
            'discount_percentage' => $billDiscPct,
            'discount_amount'     => $billDiscAmt,
            'tax_percentage'      => $taxPct,
            'tax_amount'          => $taxAmt,
            'total'               => $total,
        ];
    }

    /**
     * Authoritatively recalculate and validate a Purchase Return payload.
     */
    public function calculateAndValidatePurchaseReturn(array $data, ?User $user = null): array
    {
        $items = $data['items'] ?? [];
        if (empty($items) || !is_array($items)) {
            throw ValidationException::withMessages(['items' => ['At least one item is required.']]);
        }

        $calculatedItems = [];
        $rowsTotal = 0.0;

        foreach ($items as $idx => $raw) {
            $packSize = (int)($raw['pack_size'] ?? 0);
            $returnPackQty = (float)($raw['return_pack_quantity'] ?? 0);
            $returnUnitQty = (int)($raw['return_unit_quantity'] ?? 0);
            $packPurchasePrice = (float)($raw['pack_purchase_price'] ?? 0);
            $unitPurchasePrice = (float)($raw['unit_purchase_price'] ?? 0);
            $discPct = (float)($raw['item_discount_percentage'] ?? 0);

            if ($returnUnitQty < 0) {
                throw ValidationException::withMessages([
                    "items.{$idx}.return_unit_quantity" => ['Return unit quantity cannot be negative.'],
                ]);
            }
            if ($packPurchasePrice < 0 || $unitPurchasePrice < 0) {
                throw ValidationException::withMessages([
                    "items.{$idx}.unit_purchase_price" => ['Purchase price cannot be negative.'],
                ]);
            }
            if ($discPct < 0 || $discPct > 100) {
                throw ValidationException::withMessages([
                    "items.{$idx}.item_discount_percentage" => ['Discount percentage must be between 0 and 100.'],
                ]);
            }

            if ($packSize > 0) {
                if ($unitPurchasePrice <= 0 && $packPurchasePrice > 0) {
                    $unitPurchasePrice = round($packPurchasePrice / $packSize, 4);
                } elseif ($packPurchasePrice <= 0 && $unitPurchasePrice > 0) {
                    $packPurchasePrice = round($unitPurchasePrice * $packSize, 2);
                }
            }

            $lineGross = round($returnUnitQty * $unitPurchasePrice, 2);
            $lineDiscAmt = round(($lineGross * $discPct) / 100, 2);
            $lineSubTotal = round($lineGross - $lineDiscAmt, 2);

            $rowsTotal += $lineSubTotal;

            $calculatedItem = $raw;
            $calculatedItem['pack_size'] = $packSize;
            $calculatedItem['return_pack_quantity'] = $returnPackQty;
            $calculatedItem['return_unit_quantity'] = $returnUnitQty;
            $calculatedItem['pack_purchase_price'] = $packPurchasePrice;
            $calculatedItem['unit_purchase_price'] = $unitPurchasePrice;
            $calculatedItem['item_discount_percentage'] = $discPct;
            $calculatedItem['sub_total'] = $lineSubTotal;

            $calculatedItems[] = $calculatedItem;
        }

        $rowsTotal = round($rowsTotal, 2);

        $billDiscPct = 0.0;
        $billDiscAmt = 0.0;

        if (isset($data['discount_amount']) && $data['discount_amount'] !== '' && (float)$data['discount_amount'] != 0) {
            $billDiscAmt = max(0.0, (float)$data['discount_amount']);
            $billDiscPct = $rowsTotal > 0 ? round(($billDiscAmt / $rowsTotal) * 100, 2) : 0.0;
        } elseif (isset($data['discount_percentage']) && $data['discount_percentage'] !== '' && (float)$data['discount_percentage'] != 0) {
            $billDiscPct = max(0.0, min(100.0, (float)$data['discount_percentage']));
            $billDiscAmt = round(($rowsTotal * $billDiscPct) / 100, 2);
        }

        if ($billDiscAmt > $rowsTotal) {
            $billDiscAmt = $rowsTotal;
            $billDiscPct = $rowsTotal > 0 ? 100.0 : 0.0;
        }

        $afterDiscount = max(0.0, round($rowsTotal - $billDiscAmt, 2));

        $taxPct = 0.0;
        $taxAmt = 0.0;

        if (isset($data['tax_amount']) && $data['tax_amount'] !== '' && (float)$data['tax_amount'] != 0) {
            $taxAmt = max(0.0, (float)$data['tax_amount']);
            $taxPct = $afterDiscount > 0 ? round(($taxAmt / $afterDiscount) * 100, 2) : 0.0;
        } elseif (isset($data['tax_percentage']) && $data['tax_percentage'] !== '' && (float)$data['tax_percentage'] != 0) {
            $taxPct = max(0.0, min(100.0, (float)$data['tax_percentage']));
            $taxAmt = round(($afterDiscount * $taxPct) / 100, 2);
        }

        $total = round($afterDiscount + $taxAmt, 2);

        return [
            'items'               => $calculatedItems,
            'gross_total'         => $rowsTotal,
            'discount_percentage' => $billDiscPct,
            'discount_amount'     => $billDiscAmt,
            'tax_percentage'      => $taxPct,
            'tax_amount'          => $taxAmt,
            'total'               => $total,
        ];
    }
}

