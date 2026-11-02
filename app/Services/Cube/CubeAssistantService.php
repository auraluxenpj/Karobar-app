<?php

namespace App\Services\Cube;

use App\Models\Setting;
use App\Models\User;
use Illuminate\Support\Facades\Schema;
use Throwable;

class CubeAssistantService
{
    public function __construct(
        protected CubeKnowledgeRetriever $retriever,
        protected CubePromptBuilder $promptBuilder,
        protected CubeQuotaGuard $quotaGuard,
        protected GroqProvider $groqProvider,
        protected GeminiProvider $geminiProvider,
        protected CubeTaskExecutorService $taskExecutor,
    ) {}

    /**
     * Processes a user question through the Hybrid Cube Intelligence pipeline:
     *   0. Non-Destructive AI Task Execution (Add Product, Edit Product, Bulk Auto-Fill Formulations; Delete Hardcoded Blocked)
     *   1. Live ERP Data Privacy Boundary check
     *   2. Local Knowledge Base Retrieval (top 3–4 verified sections)
     *   3. Layer 2: Groq Primary AI (free tier)
     *   4. Layer 3: Gemini Backup AI (free tier)
     *   5. Layer 4: Deterministic Local Knowledge Fallback
     *
     * @param  array{
     *   question: string,
     *   language?: string,
     *   current_route?: string,
     *   history?: array<int, array{role: string, content: string}>,
     *   matched_intent_id?: ?string,
     *   screen_guide_id?: ?string
     * }  $payload
     * @return array<string, mixed>
     */
    public function ask(array $payload, ?User $user = null): array
    {
        $question = trim((string) ($payload['question'] ?? ''));
        $language = in_array(($payload['language'] ?? 'en'), ['en', 'ur', 'both'], true)
            ? (string) $payload['language']
            : 'en';
        $currentRoute = trim((string) ($payload['current_route'] ?? '/dashboard')) ?: '/dashboard';
        $history = is_array($payload['history'] ?? null) ? array_slice($payload['history'], -6) : [];
        $matchedIntentId = isset($payload['matched_intent_id']) ? trim((string) $payload['matched_intent_id']) : null;
        $screenGuideId = isset($payload['screen_guide_id']) ? trim((string) $payload['screen_guide_id']) : null;
        $rawExplainMode = (string) ($payload['explain_mode'] ?? 'qa');
        $explainMode = in_array($rawExplainMode, ['qa', 'cursor_element', 'screen_topic'], true)
            ? $rawExplainMode
            : 'qa';
        $elementContext = is_array($payload['element_context'] ?? null) ? $payload['element_context'] : null;
        $userConfirmed = (bool) ($payload['user_confirmed'] ?? false);
        $productVersion = $this->retriever->getProductVersion();

        // 0. Non-Destructive AI Task Execution (Add Product, Edit Product, Bulk Auto-Fill Formulations; Delete Hardcoded Blocked)
        if ($explainMode === 'qa' && empty($elementContext)) {
            $taskResult = $this->taskExecutor->detectAndExecuteFromChat($user, $question, $language, $productVersion, $history, $userConfirmed);
            if ($taskResult !== null) {
                return $taskResult;
            }
        }

        // 1. Enforce Live ERP Data Privacy Boundary (never query live DB tables or send live data requests to AI)
        if ($explainMode !== 'cursor_element') {
            $liveBoundary = $this->retriever->detectLiveRecordQuery($question);
            if ($liveBoundary !== null) {
                return $this->formatResponse(
                    titleEn: $liveBoundary['title_en'],
                    titleUr: $liveBoundary['title_ur'],
                    answerEn: $liveBoundary['answer_en'],
                    answerUr: $liveBoundary['answer_ur'],
                    sourceIds: $liveBoundary['source_ids'],
                    evidenceClassification: 'documented_info',
                    provider: 'local',
                    providerStatus: 'local_privacy_boundary',
                    fallbackUsed: false,
                    links: $liveBoundary['links'],
                    workflowId: null,
                    productVersion: $productVersion,
                    providerTrace: []
                );
            }
        }

        // 2. Retrieve Top 3–4 Verified Documentation Sections (+ Learned Knowledge & Element Context)
        $retrieval = $this->retriever->retrieve(
            question: $question,
            currentRoute: $currentRoute,
            matchedIntentId: $matchedIntentId,
            screenGuideId: $screenGuideId,
            history: $history,
            elementContext: $elementContext,
            explainMode: $explainMode
        );

        $localFallback = $retrieval['local_fallback'];
        $verifiedLinks = $retrieval['links'];
        $verifiedWorkflowId = $retrieval['workflow_id'];
        $verifiedSourceIds = $retrieval['source_ids'];

        // If no relevant documentation exists in the knowledge base, acknowledge insufficient verified info locally
        if (! $retrieval['has_verified_docs']) {
            return $this->formatResponse(
                titleEn: $localFallback['title_en'],
                titleUr: $localFallback['title_ur'],
                answerEn: $localFallback['answer_en'],
                answerUr: $localFallback['answer_ur'],
                sourceIds: $localFallback['source_ids'],
                evidenceClassification: 'current_screen_context',
                provider: 'local',
                providerStatus: 'local_insufficient_docs',
                fallbackUsed: true,
                links: $localFallback['links'],
                workflowId: $localFallback['workflow_id'],
                productVersion: $productVersion,
                providerTrace: ['reason' => 'no_verified_documentation_match']
            );
        }

        // 3. Build Grounded Prompts
        $prompts = $this->promptBuilder->buildPrompts(
            question: $question,
            language: $language,
            currentRoute: $currentRoute,
            retrievedSections: $retrieval['sections'],
            history: $history,
            currentScreen: $retrieval['current_screen'],
            productVersion: $productVersion,
            elementContext: $elementContext,
            explainMode: $explainMode
        );

        // 4. Apply any runtime Cube AI settings saved via the Settings UI before inspecting providers
        try {
            if (Schema::hasTable('settings')) {
                Setting::first()?->applyCubeAiConfig();
            }
        } catch (Throwable) {
            // Fall back to config('cube.*') if settings table is unavailable
        }

        // 5. Attempt Layer 2 (Groq Primary) -> Layer 3 (Gemini Backup)
        $primaryProvider = (string) config('cube.primary_provider', 'groq');
        $backupProvider = (string) config('cube.backup_provider', 'gemini');
        $providerOrder = array_values(array_unique(array_filter([$primaryProvider, $backupProvider])));

        $providerTrace = [];

        foreach ($providerOrder as $index => $providerName) {
            if (! in_array($providerName, ['groq', 'gemini'], true)) {
                continue;
            }

            $inspection = $this->quotaGuard->inspectProvider($providerName);
            if (! $inspection['can_attempt']) {
                $providerTrace[$providerName] = [
                    'attempted' => false,
                    'status' => $inspection['status'],
                    'reason' => $inspection['reason'],
                ];
                continue;
            }

            $this->quotaGuard->recordAttempt($providerName);

            $result = $providerName === 'groq'
                ? $this->groqProvider->generate($prompts['system'], $prompts['user'])
                : $this->geminiProvider->generate($prompts['system'], $prompts['user']);

            if ($result['ok'] === true && isset($result['data']) && is_array($result['data'])) {
                $validated = $this->validateAndNormalizeModelOutput(
                    modelData: $result['data'],
                    verifiedSourceIds: $verifiedSourceIds,
                    localFallback: $localFallback
                );

                if ($validated !== null) {
                    $this->quotaGuard->recordSuccess($providerName);
                    $providerTrace[$providerName] = [
                        'attempted' => true,
                        'status' => 'ok',
                    ];

                    $learnedMeta = $this->retriever->recordLearnedImprovement([
                        'question' => $question,
                        'current_route' => $currentRoute,
                        'explain_mode' => $explainMode,
                        'element_context' => $elementContext,
                        'title_en' => $validated['title_en'],
                        'title_ur' => $validated['title_ur'],
                        'answer_en' => $validated['answer_en'],
                        'answer_ur' => $validated['answer_ur'],
                        'source_ids' => $validated['source_ids'],
                        'links' => $verifiedLinks,
                        'workflow_id' => $verifiedWorkflowId,
                        'provider' => $providerName,
                    ]);

                    $providerStatus = $index === 0 ? "{$providerName}_primary" : "{$providerName}_backup";

                    $formatted = $this->formatResponse(
                        titleEn: $validated['title_en'],
                        titleUr: $validated['title_ur'],
                        answerEn: $validated['answer_en'],
                        answerUr: $validated['answer_ur'],
                        sourceIds: $validated['source_ids'],
                        evidenceClassification: 'ai_grounded_docs',
                        provider: $providerName,
                        providerStatus: $providerStatus,
                        fallbackUsed: $index > 0,
                        links: $verifiedLinks,
                        workflowId: $verifiedWorkflowId,
                        productVersion: $productVersion,
                        providerTrace: $providerTrace
                    );
                    $formatted['knowledge_improved'] = (bool) ($learnedMeta['learned'] ?? false);
                    $formatted['learned_key'] = (string) ($learnedMeta['knowledge_key'] ?? '');

                    return $formatted;
                }

                // Invalid or unsafe AI output -> record failure and fall back
                $this->quotaGuard->recordTransientFailure(
                    $providerName,
                    (int) ($result['http_status'] ?? 200),
                    'invalid_or_unsafe_ai_output'
                );
                $providerTrace[$providerName] = [
                    'attempted' => true,
                    'status' => 'invalid_output',
                ];
                continue;
            }

            // Handle provider error classification
            $errorType = (string) ($result['error_type'] ?? 'transient');
            $httpStatus = (int) ($result['http_status'] ?? 503);
            $errorCode = (string) ($result['error_code'] ?? 'provider_error');

            if ($errorType === 'rate_limit') {
                $this->quotaGuard->recordRateLimit(
                    $providerName,
                    $result['retry_after'] ?? null,
                    $httpStatus,
                    $errorCode
                );
                $providerTrace[$providerName] = [
                    'attempted' => true,
                    'status' => 'rate_limited',
                ];
            } elseif ($errorType === 'permanent_disable') {
                $this->quotaGuard->recordPermanentDisable(
                    $providerName,
                    (string) ($result['reason'] ?? 'auth_billing_or_eligibility_error'),
                    $httpStatus,
                    $errorCode
                );
                $providerTrace[$providerName] = [
                    'attempted' => true,
                    'status' => 'disabled_until_reconfigured',
                ];
            } else {
                $this->quotaGuard->recordTransientFailure(
                    $providerName,
                    $httpStatus,
                    $errorCode
                );
                $providerTrace[$providerName] = [
                    'attempted' => true,
                    'status' => $errorType === 'invalid_output' ? 'invalid_output' : 'transient_error',
                ];
            }
        }

        // 5. Layer 4: Deterministic Local Knowledge Fallback
        return $this->formatResponse(
            titleEn: $localFallback['title_en'],
            titleUr: $localFallback['title_ur'],
            answerEn: $localFallback['answer_en'],
            answerUr: $localFallback['answer_ur'],
            sourceIds: $verifiedSourceIds,
            evidenceClassification: 'documented_info',
            provider: 'local',
            providerStatus: 'local_fallback',
            fallbackUsed: true,
            links: $verifiedLinks,
            workflowId: $verifiedWorkflowId,
            productVersion: $productVersion,
            providerTrace: $providerTrace
        );
    }

    /**
     * Validates that the AI output adheres to the required schema and does not contain
     * unsafe HTML/scripts, invented URLs, or CSS selectors.
     *
     * @param  array<string, mixed>  $modelData
     * @param  array<int, string>  $verifiedSourceIds
     * @param  array<string, mixed>  $localFallback
     * @return ?array{title_en: string, title_ur: string, answer_en: string, answer_ur: string, source_ids: array<int, string>}
     */
    protected function validateAndNormalizeModelOutput(
        array $modelData,
        array $verifiedSourceIds,
        array $localFallback
    ): ?array {
        $titleEn = trim((string) ($modelData['title_en'] ?? data_get($modelData, 'title.en', '')));
        $titleUr = trim((string) ($modelData['title_ur'] ?? data_get($modelData, 'title.ur', '')));
        $answerEn = trim((string) ($modelData['answer_en'] ?? ($modelData['en'] ?? '')));
        $answerUr = trim((string) ($modelData['answer_ur'] ?? ($modelData['ur'] ?? '')));

        if ($answerEn === '' && $answerUr === '') {
            return null;
        }

        if ($titleEn === '') {
            $titleEn = (string) ($localFallback['title_en'] ?? 'Karobar ERP Guide');
        }
        if ($titleUr === '') {
            $titleUr = (string) ($localFallback['title_ur'] ?? 'کاروبار ایپ رہنمائی');
        }
        if ($answerEn === '') {
            $answerEn = (string) ($localFallback['answer_en'] ?? $answerUr);
        }
        if ($answerUr === '') {
            $answerUr = (string) ($localFallback['answer_ur'] ?? $answerEn);
        }

        $combined = $titleEn."\n".$titleUr."\n".$answerEn."\n".$answerUr;

        // Reject unsafe script injection, event handlers, or invented external URLs/selectors
        if (
            preg_match('/<\s*script\b/i', $combined) ||
            preg_match('/<\s*iframe\b/i', $combined) ||
            preg_match('/javascript\s*:/i', $combined) ||
            preg_match('/on(?:load|error|click|mouseover)\s*=/i', $combined) ||
            preg_match('/https?:\/\/[^\s)]+/i', $combined) ||
            preg_match('/document\.querySelector/i', $combined)
        ) {
            return null;
        }

        // Filter source_ids strictly against retrieved verified source IDs
        $rawSourceIds = is_array($modelData['source_ids'] ?? null) ? $modelData['source_ids'] : [];
        $allowedLookup = array_flip($verifiedSourceIds);
        $filteredSourceIds = [];
        foreach ($rawSourceIds as $sid) {
            if (is_string($sid) && isset($allowedLookup[$sid])) {
                $filteredSourceIds[] = $sid;
            }
        }
        if (empty($filteredSourceIds)) {
            $filteredSourceIds = $verifiedSourceIds;
        }

        return [
            'title_en' => mb_substr(strip_tags($titleEn), 0, 160, 'UTF-8'),
            'title_ur' => mb_substr(strip_tags($titleUr), 0, 160, 'UTF-8'),
            'answer_en' => mb_substr(strip_tags($answerEn), 0, 4000, 'UTF-8'),
            'answer_ur' => mb_substr(strip_tags($answerUr), 0, 4000, 'UTF-8'),
            'source_ids' => array_values(array_unique($filteredSourceIds)),
        ];
    }

    /**
     * Formats the final response payload compatible with `FeatureGuideBot.jsx` (`kind: "qa"`).
     */
    protected function formatResponse(
        string $titleEn,
        string $titleUr,
        string $answerEn,
        string $answerUr,
        array $sourceIds,
        string $evidenceClassification,
        string $provider,
        string $providerStatus,
        bool $fallbackUsed,
        array $links,
        ?string $workflowId,
        string $productVersion,
        array $providerTrace
    ): array {
        $evidenceBadge = $this->buildEvidenceBadge($evidenceClassification, $provider, $productVersion);

        return [
            'kind' => 'qa',
            'title_en' => $titleEn,
            'title_ur' => $titleUr,
            'answer_en' => $answerEn,
            'answer_ur' => $answerUr,
            'title' => [
                'en' => $titleEn,
                'ur' => $titleUr,
            ],
            'en' => $answerEn,
            'ur' => $answerUr,
            'source_ids' => $sourceIds,
            'evidence_classification' => $evidenceClassification,
            'evidence_badge' => $evidenceBadge,
            'provider' => $provider,
            'provider_status' => $providerStatus,
            'fallback_used' => $fallbackUsed,
            'links' => $links,
            'workflow_id' => $workflowId,
            'provider_trace' => $providerTrace,
        ];
    }

    protected function buildEvidenceBadge(string $evidenceClassification, string $provider, string $productVersion): array
    {
        if ($evidenceClassification === 'ai_grounded_docs') {
            $providerLabel = $provider === 'groq' ? 'Groq AI' : ($provider === 'gemini' ? 'Gemini AI' : 'Generative AI');

            return [
                'en' => "✨ Generated by {$providerLabel} • Live Generative AI (v{$productVersion})",
                'ur' => "✨ {$providerLabel} سے تیار کردہ براہِ راست اے آئی وضاحت (v{$productVersion})",
            ];
        }

        if ($evidenceClassification === 'current_screen_context') {
            return [
                'en' => "🧭 Current Screen Context • Karobar Knowledge Base (v{$productVersion})",
                'ur' => "🧭 موجودہ اسکرین کا سیاق و سباق • کاروبار ایپ گائیڈ (v{$productVersion})",
            ];
        }

        return [
            'en' => "📘 Docs Fallback • Karobar Knowledge Base (v{$productVersion})",
            'ur' => "📘 گائیڈ فال بیک • کاروبار ایپ مستند گائیڈ (v{$productVersion})",
        ];
    }
}
