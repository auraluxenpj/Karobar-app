<?php

namespace App\Http\Controllers;

use App\Services\BrandImportService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class BrandImportController extends Controller
{
    public function __construct(private BrandImportService $service) {}

    // GET /api/brands/import/template
    public function template(): StreamedResponse
    {
        return response()->streamDownload(function () {
            echo "name,image\n";
            echo "Acme,https://example.com/logo-acme.png\n";
            echo "Nova Brands,\n";
        }, 'brands_template.csv', ['Content-Type' => 'text/csv']);
    }

    // POST /api/brands/import/validate (multipart form-data: file, delimiter?)
    public function validateUpload(Request $request)
    {
        $request->validate([
            'file' => ['required','file','mimes:csv,txt'],
            'delimiter' => ['nullable','in:,,;,\t,|'],
        ]);

        $stored    = $this->service->storeUploaded($request->file('file'));
        $delimiter = $request->input('delimiter', ',');

        $res = $this->service->validateCsv($stored['path'], $delimiter);
        if (!$res['ok']) {
            @unlink($stored['path']);
            return response()->json($res, 422);
        }
        $res['token'] = $stored['token'];
        return response()->json($res);
    }

    // POST /api/brands/import/commit  (JSON: {token, insert_valid_only:true, delimiter?})
    public function commit(Request $request)
    {
        $request->validate([
            'token' => ['required','uuid'],
            'insert_valid_only' => ['sometimes','boolean'],
            'delimiter' => ['nullable','in:,,;,\t,|'],
        ]);

        $token = (string) $request->string('token');
        $relative = "imports/brands/{$token}.csv"; // SAME folder we saved to
        // use the SAME disk we used to save the file
        if (!Storage::disk('local')->exists($relative)) {
            return response()->json(['message' => 'Upload token expired or file missing.'], 404);
        }
        $path  = Storage::disk('local')->path($relative);

        $stats = $this->service->commit(
            $path,
            $request->boolean('insert_valid_only', true),
            $request->input('delimiter', ',')
        );

        // clean up after successful commit
        Storage::disk('local')->delete($relative);

        return response()->json([
            'message' => 'Import complete.',
            'stats'   => $stats
        ]);
    }
}
