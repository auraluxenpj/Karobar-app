<?php

namespace App\Http\Controllers;

use App\Models\Category;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class CategoryController extends Controller
{
    /**
     * GET /api/categories/search
     * Ability: category.view (policy: viewAny)
     */
    public function search(Request $req)
    {
        $this->authorize('lookup', Category::class);

        $q     = trim($req->input('q', ''));
        $limit = max(1, min((int)$req->input('limit', 50), 2000));

        $query = Category::select('id','name')->orderBy('name');

        if ($q !== '') {
            $query->where('name', 'like', "%{$q}%");
        }

        return $query->limit($limit)->get();
    }

    /**
     * GET /api/categories
     * Ability: category.view (policy: viewAny)
     */
    public function index()
    {
        $this->authorize('viewAny', Category::class);

        return response()->json(
            Category::withCount('products')
                ->orderBy('name')
                ->get()
        );
    }

    /**
     * POST /api/categories
     * Ability: category.create (policy: create)
     */
    public function store(Request $request)
    {
        $this->authorize('create', Category::class);

        $validated = $request->validate([
            'name' => 'required|unique:categories,name',
        ]);

        $category = Category::create($validated);

        return response()->json($category, 201);
    }

    /**
     * GET /api/categories/{category}
     * Ability: category.view (policy: view)
     */
    public function show(Category $category)
    {
        $this->authorize('view', $category);

        return $category;
    }

    /**
     * PUT/PATCH /api/categories/{category}
     * Ability: category.update (policy: update)
     */
    public function update(Request $request, Category $category)
    {
        $this->authorize('update', $category);

        $validated = $request->validate([
            'name' => 'required|unique:categories,name,' . $category->id,
        ]);

        $category->update($validated);

        return response()->json($category);
    }

    /**
     * DELETE /api/categories/{category}
     * Ability: category.delete (policy: delete)
     */
    public function destroy(Category $category)
    {
        $this->authorize('delete', $category);

        if ($category->products()->exists()) {
            return response()->json([
                'message' => 'Cannot delete: category is used by one or more products.'
            ], 422);
        }

        $category->delete();

        return response()->json(null, 204);
    }

    /**
     * GET /api/categories/export
     * Ability: category.export (policy: export)  ← custom policy method
     */
    public function export(): StreamedResponse
    {
        $this->authorize('export', Category::class);

        $file = 'categories_' . now()->format('Y-m-d_H-i-s') . '.csv';

        return response()->streamDownload(function () {
            $out = fopen('php://output', 'w');
            // UTF-8 BOM for Excel
            fprintf($out, chr(0xEF).chr(0xBB).chr(0xBF));
            // Header
            fputcsv($out, ['name']);
            $sanitizeCsv = static function ($val) {
                $str = (string) ($val ?? '');
                if ($str !== '' && in_array($str[0], ['=', '+', '-', '@', "\t", "\r"], true) && !preg_match('/^[+-]?\d+(\.\d+)?$/', $str)) {
                    return "'" . $str;
                }
                return $str;
            };
            // Rows
            Category::select('name')
                ->orderBy('name')
                ->chunk(1000, function ($chunk) use ($out, $sanitizeCsv) {
                    foreach ($chunk as $c) {
                        fputcsv($out, [$sanitizeCsv($c->name ?? '')]);
                    }
                });
            fclose($out);
        }, $file, ['Content-Type' => 'text/csv; charset=UTF-8']);
    }
}
