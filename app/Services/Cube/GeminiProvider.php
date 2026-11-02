<?php

namespace App\Services\Cube;

use App\Models\Setting;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Throwable;

class GeminiProvider
{
    /**
     * Calls Google's official Gemini Developer API (`generateContent`).
     * Automatically discovers available `generateContent` models if the configured
     * model ID is not found on the user's Google AI Studio project.
     *
     * @return array{
     *   ok: bool,
     *   provider: string,
     *   model: string,
     *   http_status: int,
     *   data?: array<string, mixed>,
     *   available_models?: list<string>,
     *   error_type?: string,
     *   error_code?: string,
     *   error_message?: string,
     *   reason?: string,
     *   retry_after?: ?string
     * }
     */
    public function generate(string $systemPrompt, string $userPrompt): array
    {
        $config = (array) config('cube.providers.gemini', []);
        $apiKey = trim((string) ($config['api_key'] ?? ''));
        $model = trim((string) ($config['model'] ?? 'gemini-3.8-flash'));
        $endpointBase = rtrim((string) ($config['endpoint_base'] ?? 'https://generativelanguage.googleapis.com/v1beta/models'), '/');
        $endpoint = "{$endpointBase}/{$model}:generateContent";
        $timeout = max(2, (int) ($config['timeout_seconds'] ?? 25));
        $connectTimeout = max(1, (int) ($config['connect_timeout_seconds'] ?? 10));
        $maxTokens = max(1024, (int) ($config['max_output_tokens'] ?? 4096));
        $temperature = (float) ($config['temperature'] ?? 0.3);

        $headers = [
            'x-goog-api-key' => $apiKey,
            'Content-Type' => 'application/json',
            'Accept' => 'application/json',
            'User-Agent' => 'KarobarApp-CubeAssistant/2.0',
        ];

        $isGemmaModel = str_contains(strtolower($model), 'gemma');
        $payload = $this->buildModelPayload(
            $model,
            $systemPrompt,
            $userPrompt,
            $temperature,
            $maxTokens,
            $isGemmaModel
        );

        try {
            $response = $this->sendHttpRequest($headers, $endpoint, $payload, $connectTimeout, $timeout);
            $discoveredModels = [];

            // If the model rejected system_instruction or responseMimeType with HTTP 400, retry in compatibility mode
            if ($response->status() === 400 && ! $isGemmaModel) {
                $compatPayload = $this->buildModelPayload(
                    $model,
                    $systemPrompt,
                    $userPrompt,
                    $temperature,
                    $maxTokens,
                    true
                );
                $compatResponse = $this->sendHttpRequest($headers, $endpoint, $compatPayload, $connectTimeout, $timeout);
                if ($compatResponse->successful() || $compatResponse->status() !== 400) {
                    $response = $compatResponse;
                }
            }

            // If the configured model returns 404 or unsupported 400, discover available generateContent models on this key
            if ($response->status() === 404 || $response->status() === 400) {
                $discoveredModels = $this->discoverChatModels($headers, $endpointBase, $connectTimeout, $timeout);
                $candidates = array_values(array_unique(array_filter(
                    array_merge($discoveredModels, ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash']),
                    static fn (string $m) => $m !== $model
                )));

                foreach (array_slice($candidates, 0, 3) as $candidateModel) {
                    $fallbackEndpoint = "{$endpointBase}/{$candidateModel}:generateContent";
                    $candidatePayload = $this->buildModelPayload(
                        $candidateModel,
                        $systemPrompt,
                        $userPrompt,
                        $temperature,
                        $maxTokens,
                        str_contains(strtolower($candidateModel), 'gemma')
                    );
                    $fallbackResponse = $this->sendHttpRequest($headers, $fallbackEndpoint, $candidatePayload, $connectTimeout, $timeout);
                    if ($fallbackResponse->successful()) {
                        $response = $fallbackResponse;
                        $model = $candidateModel;
                        $this->persistDiscoveredModel($candidateModel);
                        break;
                    }
                    if ($fallbackResponse->status() !== 404 && $fallbackResponse->status() !== 400) {
                        $response = $fallbackResponse;
                        $model = $candidateModel;
                        break;
                    }
                }
            }

            $status = $response->status();

            if ($response->successful()) {
                $body = $response->json();
                $parts = (array) data_get($body, 'candidates.0.content.parts', []);
                $textChunks = [];
                foreach ($parts as $part) {
                    if (is_array($part) && empty($part['thought']) && isset($part['text']) && is_string($part['text'])) {
                        $textChunks[] = $part['text'];
                    }
                }
                $rawText = ! empty($textChunks)
                    ? implode("\n", $textChunks)
                    : (string) data_get($body, 'candidates.0.content.parts.0.text', '');
                $decoded = $this->decodeJsonContent($rawText);

                if ($decoded === null) {
                    return [
                        'ok' => false,
                        'provider' => 'gemini',
                        'model' => $model,
                        'http_status' => $status,
                        'error_type' => 'invalid_output',
                        'error_code' => 'malformed_json_response',
                        'error_message' => 'Model returned non-JSON output.',
                    ];
                }

                return [
                    'ok' => true,
                    'provider' => 'gemini',
                    'model' => $model,
                    'http_status' => $status,
                    'data' => $decoded,
                    'available_models' => $discoveredModels,
                ];
            }

            $errorBody = (array) $response->json();
            $errorStatus = (string) (data_get($errorBody, 'error.status') ?: 'http_'.$status);
            $rawErrorMessage = trim((string) data_get($errorBody, 'error.message', ''));
            $errorMessage = strtolower($rawErrorMessage);

            if ($status === 429) {
                if (str_contains($errorMessage, 'billing') || str_contains($errorMessage, 'paid') || str_contains($errorMessage, 'free_tier_not_available')) {
                    return [
                        'ok' => false,
                        'provider' => 'gemini',
                        'model' => $model,
                        'http_status' => 429,
                        'error_type' => 'permanent_disable',
                        'error_code' => $errorStatus,
                        'error_message' => $this->sanitizeErrorMessage($rawErrorMessage, $apiKey),
                        'reason' => 'gemini_billing_or_tier_ineligible',
                    ];
                }

                return [
                    'ok' => false,
                    'provider' => 'gemini',
                    'model' => $model,
                    'http_status' => 429,
                    'error_type' => 'rate_limit',
                    'error_code' => $errorStatus ?: 'RESOURCE_EXHAUSTED',
                    'error_message' => $this->sanitizeErrorMessage($rawErrorMessage, $apiKey),
                    'retry_after' => $response->header('Retry-After') ?: null,
                ];
            }

            if (
                in_array($status, [401, 402, 403, 404], true) ||
                str_contains($errorStatus, 'PERMISSION_DENIED') ||
                str_contains($errorStatus, 'UNAUTHENTICATED') ||
                str_contains($errorStatus, 'FAILED_PRECONDITION') ||
                str_contains($errorMessage, 'api key not valid') ||
                str_contains($errorMessage, 'billing') ||
                str_contains($errorMessage, 'not found')
            ) {
                return [
                    'ok' => false,
                    'provider' => 'gemini',
                    'model' => $model,
                    'http_status' => $status,
                    'error_type' => 'permanent_disable',
                    'error_code' => $errorStatus,
                    'error_message' => $this->sanitizeErrorMessage($rawErrorMessage, $apiKey),
                    'available_models' => $discoveredModels,
                    'reason' => 'gemini_auth_billing_or_model_ineligible',
                ];
            }

            return [
                'ok' => false,
                'provider' => 'gemini',
                'model' => $model,
                'http_status' => $status,
                'error_type' => 'transient',
                'error_code' => $errorStatus ?: 'http_'.$status,
                'error_message' => $this->sanitizeErrorMessage($rawErrorMessage, $apiKey),
                'available_models' => $discoveredModels,
            ];
        } catch (Throwable $e) {
            return [
                'ok' => false,
                'provider' => 'gemini',
                'model' => $model,
                'http_status' => 503,
                'error_type' => 'transient',
                'error_code' => 'connection_or_timeout_error',
                'error_message' => $this->sanitizeErrorMessage($e->getMessage(), $apiKey),
            ];
        }
    }

    /**
     * Builds the request payload for Gemini / Gemma `generateContent` endpoints.
     * Gemma models do not support `system_instruction` or `responseMimeType: application/json`,
     * so compatibility mode merges system instructions into the user prompt.
     *
     * @return array<string, mixed>
     */
    protected function buildModelPayload(
        string $model,
        string $systemPrompt,
        string $userPrompt,
        float $temperature,
        int $maxTokens,
        bool $compatibilityMode = false
    ): array {
        if ($compatibilityMode || str_contains(strtolower($model), 'gemma')) {
            return [
                'contents' => [
                    [
                        'role' => 'user',
                        'parts' => [
                            [
                                'text' => "SYSTEM INSTRUCTIONS:\n{$systemPrompt}\n\nUSER REQUEST:\n{$userPrompt}",
                            ],
                        ],
                    ],
                ],
                'generationConfig' => [
                    'temperature' => $temperature,
                    'maxOutputTokens' => $maxTokens,
                ],
            ];
        }

        return [
            'system_instruction' => [
                'parts' => [
                    ['text' => $systemPrompt],
                ],
            ],
            'contents' => [
                [
                    'role' => 'user',
                    'parts' => [
                        ['text' => $userPrompt],
                    ],
                ],
            ],
            'generationConfig' => [
                'temperature' => $temperature,
                'maxOutputTokens' => $maxTokens,
                'responseMimeType' => 'application/json',
            ],
        ];
    }

    /**
     * Queries Google's `/v1beta/models` endpoint to discover active flash/gemma text models.
     *
     * @param  array<string, string>  $headers
     * @return list<string>
     */
    public function discoverChatModels(
        array $headers,
        string $endpointBase,
        int $connectTimeout = 10,
        int $timeout = 15
    ): array {
        try {
            $response = $this->sendHttpGetRequest($headers, $endpointBase, $connectTimeout, $timeout);
            if (! $response->successful()) {
                return [];
            }

            $items = (array) data_get($response->json(), 'models', []);
            $rawIds = [];

            foreach ($items as $item) {
                if (! is_array($item)) {
                    continue;
                }
                $methods = (array) ($item['supportedGenerationMethods'] ?? []);
                if (! in_array('generateContent', $methods, true)) {
                    continue;
                }
                $name = preg_replace('/^models\//', '', trim((string) ($item['name'] ?? ''))) ?? '';
                if ($name === '' || ! $this->isFreeTierGeminiModelId($name)) {
                    continue;
                }
                $rawIds[] = $name;
            }

            return array_values(array_unique($rawIds));
        } catch (Throwable) {
            return [];
        }
    }

    public function isFreeTierGeminiModelId(string $modelId): bool
    {
        $lower = strtolower($modelId);
        if (
            str_contains($lower, 'embed') ||
            str_contains($lower, 'imagen') ||
            str_contains($lower, 'veo') ||
            str_contains($lower, 'tts') ||
            str_contains($lower, 'audio') ||
            str_contains($lower, 'robotics') ||
            str_contains($lower, 'computer-use')
        ) {
            return false;
        }

        return (str_contains($lower, 'flash') || str_contains($lower, 'gemma'))
            && (bool) preg_match('/^[a-zA-Z0-9._-]+$/', $modelId);
    }

    protected function persistDiscoveredModel(string $workingModel): void
    {
        try {
            config(['cube.providers.gemini.model' => $workingModel]);
            $setting = Setting::first();
            if ($setting && $setting->cube_gemini_model !== $workingModel) {
                $setting->cube_gemini_model = $workingModel;
                $setting->save();
            }
        } catch (Throwable) {
            // Ignore persistence errors during stateless tests
        }
    }

    /**
     * Sends the HTTP POST request with automatic CA-bundle resolution and
     * fallback if local PHP/OpenSSL has a broken default trust store (cURL error 60/77).
     *
     * @param  array<string, string>  $headers
     * @param  array<string, mixed>  $payload
     */
    protected function sendHttpRequest(
        array $headers,
        string $endpoint,
        array $payload,
        int $connectTimeout,
        int $timeout
    ): Response {
        $options = $this->buildTransportOptions(true);

        try {
            return Http::withHeaders($headers)
                ->withOptions($options)
                ->connectTimeout($connectTimeout)
                ->timeout($timeout)
                ->post($endpoint, $payload);
        } catch (Throwable $e) {
            if ($this->isLocalSslTrustStoreError($e->getMessage())) {
                return Http::withHeaders($headers)
                    ->withoutVerifying()
                    ->withOptions($this->buildTransportOptions(false))
                    ->connectTimeout($connectTimeout)
                    ->timeout($timeout)
                    ->post($endpoint, $payload);
            }

            throw $e;
        }
    }

    /**
     * @param  array<string, string>  $headers
     */
    protected function sendHttpGetRequest(
        array $headers,
        string $endpoint,
        int $connectTimeout,
        int $timeout
    ): Response {
        $options = $this->buildTransportOptions(true);

        try {
            return Http::withHeaders($headers)
                ->withOptions($options)
                ->connectTimeout($connectTimeout)
                ->timeout($timeout)
                ->get($endpoint);
        } catch (Throwable $e) {
            if ($this->isLocalSslTrustStoreError($e->getMessage())) {
                return Http::withHeaders($headers)
                    ->withoutVerifying()
                    ->withOptions($this->buildTransportOptions(false))
                    ->connectTimeout($connectTimeout)
                    ->timeout($timeout)
                    ->get($endpoint);
            }

            throw $e;
        }
    }

    /**
     * @return array<string, mixed>
     */
    protected function buildTransportOptions(bool $verifySsl): array
    {
        $options = [
            'force_ip_resolve' => 'v4',
        ];

        if (! $verifySsl) {
            $options['verify'] = false;

            return $options;
        }

        $caBundle = $this->resolveReadableCaBundle();
        if ($caBundle !== null) {
            $options['verify'] = $caBundle;
        }

        return $options;
    }

    protected function resolveReadableCaBundle(): ?string
    {
        $candidates = array_filter([
            (string) ini_get('curl.cainfo'),
            (string) ini_get('openssl.cafile'),
            '/etc/ssl/cert.pem',
            '/etc/ssl/certs/ca-certificates.crt',
            '/etc/pki/tls/certs/ca-bundle.crt',
            '/opt/homebrew/etc/ca-certificates/cert.pem',
            '/usr/local/etc/ca-certificates/cert.pem',
        ]);

        foreach ($candidates as $path) {
            if (@is_file($path) && @is_readable($path)) {
                return $path;
            }
        }

        return null;
    }

    protected function isLocalSslTrustStoreError(string $message): bool
    {
        $lower = strtolower($message);

        return str_contains($lower, 'curl error 77')
            || str_contains($lower, 'curl error 60')
            || str_contains($lower, 'trust anchors')
            || str_contains($lower, 'ssl certificate')
            || str_contains($lower, 'unable to get local issuer certificate')
            || str_contains($lower, 'error setting certificate verify');
    }

    protected function sanitizeErrorMessage(string $message, string $apiKey): string
    {
        $clean = trim($message);
        if ($apiKey !== '' && strlen($apiKey) >= 4) {
            $clean = str_replace($apiKey, '[REDACTED]', $clean);
        }

        return mb_substr($clean, 0, 280);
    }

    protected function decodeJsonContent(string $rawContent): ?array
    {
        $trimmed = trim($rawContent);
        if ($trimmed === '') {
            return null;
        }

        $trimmed = preg_replace('/<think>[\s\S]*?<\/think>/i', '', $trimmed) ?? $trimmed;
        $trimmed = trim($trimmed);

        if (str_starts_with($trimmed, '```')) {
            $trimmed = preg_replace('/^```(?:json)?\s*/i', '', $trimmed) ?? $trimmed;
            $trimmed = preg_replace('/\s*```$/', '', $trimmed) ?? $trimmed;
            $trimmed = trim($trimmed);
        }

        $decoded = json_decode($trimmed, true);
        if (is_array($decoded)) {
            return $decoded;
        }

        if (preg_match('/\{[\s\S]*\}/', $trimmed, $matches)) {
            $fallbackDecoded = json_decode($matches[0], true);
            if (is_array($fallbackDecoded)) {
                return $fallbackDecoded;
            }
        }

        // Recover partial JSON if maxOutputTokens truncated the closing brace of a valid bilingual response
        if (str_contains($trimmed, '"answer_en"') || str_contains($trimmed, '"answer_ur"')) {
            $extracted = [];
            foreach (['title_en', 'title_ur', 'answer_en', 'answer_ur'] as $key) {
                if (preg_match('/"'.preg_quote($key, '/').'"\s*:\s*"((?:[^"\\\\]|\\\\.)*)/u', $trimmed, $m)) {
                    $val = json_decode('"'.$m[1].'"');
                    $extracted[$key] = is_string($val) ? $val : stripcslashes($m[1]);
                }
            }
            if (! empty($extracted['answer_en']) || ! empty($extracted['answer_ur'])) {
                $extracted['source_ids'] = [];

                return $extracted;
            }
        }

        return null;
    }
}
