<?php

namespace App\Services\Cube;

use App\Models\Setting;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Throwable;

class GroqProvider
{
    /**
     * Calls Groq's official OpenAI-compatible Chat Completions endpoint.
     * Automatically discovers and falls back to an available chat model on the
     * user's Groq account if the configured model returns model_not_found.
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
        $config = (array) config('cube.providers.groq', []);
        $apiKey = trim((string) ($config['api_key'] ?? ''));
        $model = trim((string) ($config['model'] ?? 'openai/gpt-oss-120b'));
        $endpoint = (string) ($config['endpoint'] ?? 'https://api.groq.com/openai/v1/chat/completions');
        $modelsEndpoint = (string) ($config['models_endpoint'] ?? 'https://api.groq.com/openai/v1/models');
        $timeout = max(2, (int) ($config['timeout_seconds'] ?? 25));
        $connectTimeout = max(1, (int) ($config['connect_timeout_seconds'] ?? 10));
        $maxTokens = max(1024, (int) ($config['max_output_tokens'] ?? 4096));
        $temperature = (float) ($config['temperature'] ?? 0.3);

        $headers = [
            'Authorization' => 'Bearer '.$apiKey,
            'Content-Type' => 'application/json',
            'Accept' => 'application/json',
            'User-Agent' => 'KarobarApp-CubeAssistant/2.0',
        ];

        try {
            $response = $this->attemptModelCompletion(
                $headers,
                $endpoint,
                $model,
                $systemPrompt,
                $userPrompt,
                $temperature,
                $maxTokens,
                $connectTimeout,
                $timeout
            );

            $discoveredModels = [];

            // If the configured model is not found or not enabled on this Groq account,
            // query /openai/v1/models to discover the exact chat models available to this API key.
            if ($this->isModelNotFoundError($response)) {
                $discoveredModels = $this->discoverChatModels($headers, $modelsEndpoint, $connectTimeout, $timeout);
                $candidates = array_values(array_filter(
                    $discoveredModels,
                    static fn (string $m) => $m !== $model
                ));

                foreach (array_slice($candidates, 0, 4) as $candidateModel) {
                    $retryResponse = $this->attemptModelCompletion(
                        $headers,
                        $endpoint,
                        $candidateModel,
                        $systemPrompt,
                        $userPrompt,
                        $temperature,
                        $maxTokens,
                        $connectTimeout,
                        $timeout
                    );

                    if ($retryResponse->successful()) {
                        $response = $retryResponse;
                        $model = $candidateModel;
                        $this->persistDiscoveredModel($candidateModel);
                        break;
                    }

                    if (! $this->isModelNotFoundError($retryResponse)) {
                        $response = $retryResponse;
                        $model = $candidateModel;
                        break;
                    }
                }
            }

            $status = $response->status();

            if ($response->successful()) {
                $body = $response->json();
                $rawContent = (string) data_get($body, 'choices.0.message.content', '');
                if (trim($rawContent) === '') {
                    $rawContent = (string) (data_get($body, 'choices.0.message.reasoning', '')
                        ?: data_get($body, 'choices.0.message.reasoning_content', ''));
                }
                $decoded = $this->decodeJsonContent($rawContent);

                if ($decoded === null) {
                    return [
                        'ok' => false,
                        'provider' => 'groq',
                        'model' => $model,
                        'http_status' => $status,
                        'error_type' => 'invalid_output',
                        'error_code' => 'malformed_json_response',
                        'error_message' => 'Model returned non-JSON output.',
                    ];
                }

                return [
                    'ok' => true,
                    'provider' => 'groq',
                    'model' => $model,
                    'http_status' => $status,
                    'data' => $decoded,
                    'available_models' => $discoveredModels,
                ];
            }

            $errorBody = (array) $response->json();
            $errorCode = (string) (data_get($errorBody, 'error.code') ?: data_get($errorBody, 'error.type') ?: 'http_'.$status);
            $rawErrorMessage = trim((string) data_get($errorBody, 'error.message', ''));
            if ($discoveredModels !== [] && $this->isModelNotFoundError($response)) {
                $rawErrorMessage .= ' (Available models on your key: '.implode(', ', array_slice($discoveredModels, 0, 6)).')';
            }
            $errorMessage = strtolower($rawErrorMessage);

            if ($status === 429) {
                if (str_contains($errorMessage, 'billing') || str_contains($errorMessage, 'paid plan') || str_contains($errorMessage, 'payment')) {
                    return [
                        'ok' => false,
                        'provider' => 'groq',
                        'model' => $model,
                        'http_status' => $status,
                        'error_type' => 'permanent_disable',
                        'error_code' => $errorCode,
                        'error_message' => $this->sanitizeErrorMessage($rawErrorMessage, $apiKey),
                        'reason' => 'billing_or_plan_ineligible',
                    ];
                }

                return [
                    'ok' => false,
                    'provider' => 'groq',
                    'model' => $model,
                    'http_status' => 429,
                    'error_type' => 'rate_limit',
                    'error_code' => $errorCode ?: 'rate_limit_exceeded',
                    'error_message' => $this->sanitizeErrorMessage($rawErrorMessage, $apiKey),
                    'retry_after' => $response->header('Retry-After') ?: null,
                ];
            }

            if (
                in_array($status, [401, 402, 403], true) ||
                str_contains($errorCode, 'invalid_api_key') ||
                str_contains($errorCode, 'model_decommissioned') ||
                str_contains($errorCode, 'model_not_found') ||
                str_contains($errorMessage, 'invalid api key') ||
                str_contains($errorMessage, 'billing') ||
                str_contains($errorMessage, 'quota') ||
                str_contains($errorMessage, 'decommissioned')
            ) {
                return [
                    'ok' => false,
                    'provider' => 'groq',
                    'model' => $model,
                    'http_status' => $status,
                    'error_type' => 'permanent_disable',
                    'error_code' => $errorCode ?: 'auth_or_eligibility_error',
                    'error_message' => $this->sanitizeErrorMessage($rawErrorMessage, $apiKey),
                    'available_models' => $discoveredModels,
                    'reason' => 'provider_auth_billing_or_eligibility_error',
                ];
            }

            return [
                'ok' => false,
                'provider' => 'groq',
                'model' => $model,
                'http_status' => $status,
                'error_type' => 'transient',
                'error_code' => $errorCode ?: 'http_'.$status,
                'error_message' => $this->sanitizeErrorMessage($rawErrorMessage, $apiKey),
                'available_models' => $discoveredModels,
            ];
        } catch (Throwable $e) {
            return [
                'ok' => false,
                'provider' => 'groq',
                'model' => $model,
                'http_status' => 503,
                'error_type' => 'transient',
                'error_code' => 'connection_or_timeout_error',
                'error_message' => $this->sanitizeErrorMessage($e->getMessage(), $apiKey),
            ];
        }
    }

    /**
     * Attempts a chat completion for a specific Groq model, automatically retrying
     * without `response_format` if the model does not support strict `json_object` mode.
     *
     * @param  array<string, string>  $headers
     */
    protected function attemptModelCompletion(
        array $headers,
        string $endpoint,
        string $model,
        string $systemPrompt,
        string $userPrompt,
        float $temperature,
        int $maxTokens,
        int $connectTimeout,
        int $timeout
    ): Response {
        $payload = [
            'model' => $model,
            'messages' => [
                ['role' => 'system', 'content' => $systemPrompt],
                ['role' => 'user', 'content' => $userPrompt],
            ],
            'temperature' => $temperature,
            'max_tokens' => $maxTokens,
            'response_format' => ['type' => 'json_object'],
        ];

        // Compound / reasoning models (gpt-oss, compound, qwen, deepseek) consume reasoning tokens
        // from max_tokens and frequently fail Groq's strict json_object validator if response_format is forced.
        $lowerModel = strtolower($model);
        if (
            str_contains($lowerModel, 'gpt-oss') ||
            str_contains($lowerModel, 'compound') ||
            str_contains($lowerModel, 'qwen') ||
            str_contains($lowerModel, 'deepseek')
        ) {
            unset($payload['response_format']);
        }

        $response = $this->sendHttpRequest($headers, $endpoint, $payload, $connectTimeout, $timeout);

        if ($response->status() === 400 && isset($payload['response_format'])) {
            unset($payload['response_format']);
            $response = $this->sendHttpRequest($headers, $endpoint, $payload, $connectTimeout, $timeout);
        }

        return $response;
    }

    protected function isModelNotFoundError(Response $response): bool
    {
        if ($response->successful()) {
            return false;
        }

        $status = $response->status();
        $body = (array) $response->json();
        $code = strtolower((string) (data_get($body, 'error.code') ?: data_get($body, 'error.type') ?: ''));
        $msg = strtolower((string) data_get($body, 'error.message', ''));

        return $status === 404
            || str_contains($code, 'model_not_found')
            || str_contains($code, 'model_decommissioned')
            || str_contains($msg, 'does not exist or you do not have access')
            || str_contains($msg, 'decommissioned');
    }

    /**
     * Queries Groq's `/openai/v1/models` endpoint to discover active text/chat models
     * enabled for this API key, ranked by suitability for bilingual JSON instruction answers.
     *
     * @param  array<string, string>  $headers
     * @return list<string>
     */
    public function discoverChatModels(
        array $headers,
        string $modelsEndpoint,
        int $connectTimeout = 10,
        int $timeout = 15
    ): array {
        try {
            $response = $this->sendHttpGetRequest($headers, $modelsEndpoint, $connectTimeout, $timeout);
            if (! $response->successful()) {
                return [];
            }

            $items = (array) data_get($response->json(), 'data', []);
            $rawIds = [];

            foreach ($items as $item) {
                if (! is_array($item)) {
                    continue;
                }
                if (isset($item['active']) && $item['active'] === false) {
                    continue;
                }
                $id = trim((string) ($item['id'] ?? ''));
                if ($id === '' || ! $this->isChatCapableModelId($id)) {
                    continue;
                }
                $rawIds[] = $id;
            }

            if ($rawIds === []) {
                return [];
            }

            $preferredOrder = [
                'openai/gpt-oss-120b',
                'openai/gpt-oss-20b',
                'qwen/qwen3.8-27b',
                'llama-3.3-70b-versatile',
                'llama-3.1-8b-instant',
                'meta-llama/llama-4-maverick-17b-128e-instruct',
                'meta-llama/llama-4-scout-17b-16e-instruct',
                'moonshotai/kimi-k2-instruct-0905',
                'moonshotai/kimi-k2-instruct',
                'groq/compound-mini',
                'groq/compound',
                'qwen/qwen3-32b',
                'deepseek-r1-distill-llama-70b',
                'gemma2-9b-it',
                'mixtral-8x7b-32768',
            ];

            usort($rawIds, static function (string $a, string $b) use ($preferredOrder): int {
                $posA = array_search($a, $preferredOrder, true);
                $posB = array_search($b, $preferredOrder, true);
                $rankA = $posA === false ? 999 : $posA;
                $rankB = $posB === false ? 999 : $posB;

                return $rankA <=> $rankB ?: strcmp($a, $b);
            });

            return array_values(array_unique($rawIds));
        } catch (Throwable) {
            return [];
        }
    }

    public function isChatCapableModelId(string $modelId): bool
    {
        $lower = strtolower($modelId);
        $excludedSubstrings = [
            'whisper',
            'tts',
            'playai',
            'guard',
            'safeguard',
            'embed',
            'moderation',
            'orpheus',
            'audio',
        ];

        foreach ($excludedSubstrings as $excluded) {
            if (str_contains($lower, $excluded)) {
                return false;
            }
        }

        return (bool) preg_match('/^[a-zA-Z0-9._\/-]+$/', $modelId);
    }

    protected function persistDiscoveredModel(string $workingModel): void
    {
        try {
            config(['cube.providers.groq.model' => $workingModel]);
            $setting = Setting::first();
            if ($setting && $setting->cube_groq_model !== $workingModel) {
                $setting->cube_groq_model = $workingModel;
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

        // Strip <think>...</think> blocks if a reasoning model emits them
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

        // Recover partial JSON if max_tokens truncated the closing brace of a valid bilingual response
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
