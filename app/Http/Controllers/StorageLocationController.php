<?php

namespace App\Http\Controllers;

use App\Models\Batch;
use App\Models\Product;
use App\Models\StorageLocation;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class StorageLocationController extends Controller
{
    private function authorizeManage(Request $request): void
    {
        $user = $request->user();
        if (
            !$user
            || (
                !$user->hasRole(['Admin', 'admin', 'super-admin'])
                && !$user->can('product.create')
                && !$user->can('product.update')
                && !$user->can('batch-expiry.update')
                && !$user->can('stock-adjustment.create')
            )
        ) {
            abort(403, 'This action is unauthorized.');
        }
    }

    private function authorizeView(Request $request): void
    {
        $user = $request->user();
        if (!$user) {
            abort(401, 'Unauthenticated.');
        }
        if ($user->hasRole(['Admin', 'admin', 'super-admin'])) {
            return;
        }
        $allowed = [
            'storage-location.view',
            'product.view',
            'product.create',
            'product.update',
            'batch-expiry.view',
            'batch-expiry.update',
            'purchase-invoice.view',
            'purchase-invoice.create',
            'sale-invoice.view',
            'sale-invoice.create',
            'stocktake.view',
            'stock-adjustment.view',
            'stock-adjustment.create',
        ];
        foreach ($allowed as $perm) {
            if ($user->can($perm)) {
                return;
            }
        }
        abort(403, 'This action is unauthorized.');
    }

    public function index(Request $request)
    {
        $this->authorizeView($request);

        $query = StorageLocation::query()
            ->withCount(['products', 'batches'])
            ->orderByDesc('is_default')
            ->orderBy('name');

        if ($request->boolean('active_only')) {
            $query->where('is_active', true);
        }

        return response()->json($query->get());
    }

    public function store(Request $request)
    {
        $this->authorizeManage($request);

        $validated = $request->validate([
            'name'         => ['required', 'string', 'max:120'],
            'code'         => ['nullable', 'string', 'max:40', 'unique:storage_locations,code'],
            'type'         => ['nullable', 'string', Rule::in(['shop', 'godown', 'cold_storage', 'quarantine', 'other'])],
            'default_rack' => ['nullable', 'string', 'max:100'],
            'is_default'   => ['nullable', 'boolean'],
            'is_active'    => ['nullable', 'boolean'],
            'notes'        => ['nullable', 'string', 'max:255'],
        ]);

        $code = trim((string) ($validated['code'] ?? ''));
        if ($code === '') {
            $base = strtoupper(Str::slug($validated['name'], '-'));
            $base = substr($base !== '' ? $base : 'LOC', 0, 20);
            $code = $base;
            $counter = 1;
            while (StorageLocation::where('code', $code)->exists()) {
                $counter++;
                $code = $base . '-' . $counter;
            }
        } else {
            $code = strtoupper($code);
        }

        return DB::transaction(function () use ($validated, $code) {
            $isDefault = (bool) ($validated['is_default'] ?? false);
            if ($isDefault) {
                StorageLocation::where('is_default', true)->update(['is_default' => false]);
            }

            $location = StorageLocation::create([
                'name'         => trim($validated['name']),
                'code'         => $code,
                'type'         => $validated['type'] ?? 'shop',
                'default_rack' => isset($validated['default_rack']) ? trim((string) $validated['default_rack']) : null,
                'is_default'   => $isDefault,
                'is_active'    => array_key_exists('is_active', $validated) ? (bool) $validated['is_active'] : true,
                'notes'        => isset($validated['notes']) ? trim((string) $validated['notes']) : null,
            ]);

            return response()->json($location->loadCount(['products', 'batches']), 201);
        });
    }

    public function update(Request $request, StorageLocation $storageLocation)
    {
        $this->authorizeManage($request);

        $validated = $request->validate([
            'name'         => ['required', 'string', 'max:120'],
            'code'         => ['required', 'string', 'max:40', Rule::unique('storage_locations', 'code')->ignore($storageLocation->id)],
            'type'         => ['nullable', 'string', Rule::in(['shop', 'godown', 'cold_storage', 'quarantine', 'other'])],
            'default_rack' => ['nullable', 'string', 'max:100'],
            'is_default'   => ['nullable', 'boolean'],
            'is_active'    => ['nullable', 'boolean'],
            'notes'        => ['nullable', 'string', 'max:255'],
        ]);

        return DB::transaction(function () use ($storageLocation, $validated) {
            $isDefault = array_key_exists('is_default', $validated)
                ? (bool) $validated['is_default']
                : $storageLocation->is_default;

            if ($isDefault) {
                StorageLocation::where('id', '!=', $storageLocation->id)->update(['is_default' => false]);
            }

            $storageLocation->update([
                'name'         => trim($validated['name']),
                'code'         => strtoupper(trim($validated['code'])),
                'type'         => $validated['type'] ?? $storageLocation->type,
                'default_rack' => array_key_exists('default_rack', $validated)
                    ? (trim((string) $validated['default_rack']) ?: null)
                    : $storageLocation->default_rack,
                'is_default'   => $isDefault,
                'is_active'    => array_key_exists('is_active', $validated)
                    ? (bool) $validated['is_active']
                    : $storageLocation->is_active,
                'notes'        => array_key_exists('notes', $validated)
                    ? (trim((string) $validated['notes']) ?: null)
                    : $storageLocation->notes,
            ]);

            return response()->json($storageLocation->fresh()->loadCount(['products', 'batches']));
        });
    }

    public function destroy(Request $request, StorageLocation $storageLocation)
    {
        $this->authorizeManage($request);

        if ($storageLocation->is_default) {
            throw ValidationException::withMessages([
                'storage_location' => ['Cannot delete the default storage location. Mark another location as default first.'],
            ]);
        }

        return DB::transaction(function () use ($storageLocation) {
            $fallbackId = StorageLocation::where('is_default', true)
                ->where('id', '!=', $storageLocation->id)
                ->value('id')
                ?? StorageLocation::where('id', '!=', $storageLocation->id)->orderBy('id')->value('id');

            Product::where('storage_location_id', $storageLocation->id)
                ->update(['storage_location_id' => $fallbackId]);
            Batch::where('storage_location_id', $storageLocation->id)
                ->update(['storage_location_id' => $fallbackId]);

            $storageLocation->delete();

            return response()->json(['message' => 'Storage location deleted successfully.']);
        });
    }
}

