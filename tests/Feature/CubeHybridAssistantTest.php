<?php

namespace Tests\Feature;

use App\Models\CubeProviderUsage;
use App\Models\User;
use App\Services\Cube\CubeKnowledgeRetriever;
use App\Services\LicenseService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Permission;
use Tests\TestCase;

class CubeHybridAssistantTest extends TestCase
{
    use RefreshDatabase;

    protected User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::create([
            'name' => 'Cube Test Admin',
            'email' => 'cube-admin@karobar.test',
            'password' => Hash::make('password'),
            'status' => 'active',
            'remember_token_expires_at' => now()->addHours(8),
        ]);

        // Default valid license for authenticated tests unless overridden
        $this->mock(LicenseService::class, function ($mock) {
            $mock->shouldReceive('currentStatus')->andReturn(['valid' => true])->byDefault();
        });

        config([
            'cube.ai_enabled' => true,
            'cube.free_only' => true,
            'cube.primary_provider' => 'groq',
            'cube.backup_provider' => 'gemini',
            'cube.providers.groq.enabled' => true,
            'cube.providers.groq.api_key' => 'gsk_test_free_groq_key_123456',
            'cube.providers.groq.model' => 'llama-3.3-70b-versatile',
            'cube.providers.groq.daily_limit' => 50,
            'cube.providers.gemini.enabled' => true,
            'cube.providers.gemini.api_key' => 'AIza_test_free_gemini_key_123456',
            'cube.providers.gemini.model' => 'gemini-3.8-flash',
            'cube.providers.gemini.daily_limit' => 50,
        ]);

        app(CubeKnowledgeRetriever::class)->clearLearnedKnowledge();
    }

    /**
     * 1. Authenticated access to `/api/cube/ask` (and input validation).
     */
    public function test_authenticated_access_to_cube_ask_and_rejects_forbidden_frontend_fields(): void
    {
        Http::fake([
            'api.groq.com/*' => Http::response([
                'choices' => [
                    [
                        'message' => [
                            'content' => json_encode([
                                'title_en' => 'Purchase Order vs Purchase Invoice',
                                'title_ur' => 'پرچیز آرڈر بمقابلہ پرچیز انوائس',
                                'answer_en' => '1. A Purchase Order is a demand list sent to a supplier.\n2. A Purchase Invoice adds physical stock and updates payable ledger.',
                                'answer_ur' => '1. پرچیز آرڈر سپلائر کے لیے مال کی فہرست ہے۔\n2. پرچیز انوائس سے اسٹاک اور کھاتہ اپڈیٹ ہوتا ہے۔',
                                'source_ids' => ['intent:po_vs_purchase_invoice'],
                            ], JSON_UNESCAPED_UNICODE),
                        ],
                    ],
                ],
            ], 200),
        ]);

        Sanctum::actingAs($this->user);

        $response = $this->postJson('/api/cube/ask', [
            'question' => 'Can you compare Purchase Order and Purchase Invoice in detail?',
            'language' => 'en',
            'current_route' => '/purchase-orders',
        ]);

        $response->assertOk()
            ->assertJsonPath('kind', 'qa')
            ->assertJsonPath('provider', 'groq')
            ->assertJsonPath('provider_status', 'groq_primary');

        // Reject forbidden fields from frontend (provider, css_selector, navigation_url, action_id)
        $forbiddenResponse = $this->postJson('/api/cube/ask', [
            'question' => 'How to make sale?',
            'provider' => 'groq',
            'css_selector' => '#hack',
            'navigation_url' => 'https://evil.example.com',
        ]);

        $forbiddenResponse->assertStatus(422)
            ->assertJsonValidationErrors(['provider', 'css_selector', 'navigation_url']);
    }

    /**
     * 2. Unauthenticated rejection.
     */
    public function test_unauthenticated_requests_are_rejected(): void
    {
        $response = $this->postJson('/api/cube/ask', [
            'question' => 'How to create a purchase order?',
        ]);

        $response->assertStatus(401);
    }

    /**
     * 3. License middleware enforcement.
     */
    public function test_license_middleware_enforces_valid_license(): void
    {
        $this->mock(LicenseService::class, function ($mock) {
            $mock->shouldReceive('currentStatus')->andReturn([
                'valid' => false,
                'reason' => 'License expired or missing',
            ]);
        });

        Sanctum::actingAs($this->user);

        $response = $this->postJson('/api/cube/ask', [
            'question' => 'How to add new stock?',
        ]);

        $response->assertStatus(402)
            ->assertJsonPath('code', 'license_required');
    }

    /**
     * 4. Token expiry enforcement.
     */
    public function test_token_expiry_middleware_rejects_expired_session(): void
    {
        $expiredUser = User::create([
            'name' => 'Expired Cube User',
            'email' => 'expired@karobar.test',
            'password' => Hash::make('password'),
            'status' => 'active',
            'remember_token_expires_at' => now()->subMinutes(10),
        ]);

        Sanctum::actingAs($expiredUser);

        $response = $this->postJson('/api/cube/ask', [
            'question' => 'How to add new stock?',
        ]);

        $response->assertStatus(401)
            ->assertJsonPath('expired', true);
    }

    /**
     * 5, 6, 7, 22, 23. Strong local intent answers without external AI calls, FAQ matching,
     * Screen-guide matching, Interactive walkthrough preservation, and Evidence label accuracy.
     */
    public function test_frontend_local_intelligence_layers_faq_screen_guide_walkthrough_and_evidence_labels(): void
    {
        $nodeBinary = is_executable('/Users/malikasimshahzad/.nvm/versions/node/v24.20.0/bin/node')
            ? '/Users/malikasimshahzad/.nvm/versions/node/v24.20.0/bin/node'
            : 'node';

        $script = <<<'JS'
import {
  routeUserQuery,
  SCREEN_GUIDES,
  DEMO_MANIFESTS,
  MATCH_CATEGORIES,
  EVIDENCE_TYPES,
  buildEvidenceBadge,
} from "./resources/js/data/guideBotKnowledge.js";

// Test 5: Strong local intent match (should NOT call AI)
const strongIntent = routeUserQuery("how to create purchase order", "cube", SCREEN_GUIDES["/dashboard"]);

// Test 6: FAQ match (should NOT call AI)
const faqMatch = routeUserQuery(
  "Why do dashboard numbers change when I pick different dates?",
  "cube",
  SCREEN_GUIDES["/dashboard"]
);

// Test 7: Screen-guide match (should NOT call AI)
const screenMatch = routeUserQuery(
  "explain this screen",
  "cube",
  SCREEN_GUIDES["/purchase-orders"]
);

// Test 18 (local): Roman Urdu strong match
const romanUrdu = routeUserQuery(
  "khuli goliyan kaise bechein",
  "cube",
  SCREEN_GUIDES["/sale-invoices/pos"]
);

// Test 22: Interactive walkthrough preservation with deterministic selectors
const demoReq = routeUserQuery(
  "show me how to create a purchase order",
  "cube",
  SCREEN_GUIDES["/purchase-orders"]
);
const manifest = DEMO_MANIFESTS[demoReq.workflowId];

// Test 23: Evidence label accuracy (never labels static docs as live UI observation)
const docBadge = strongIntent.evidenceBadge;
const screenBadge = screenMatch.evidenceBadge;
const domBadge = buildEvidenceBadge(EVIDENCE_TYPES.LIVE_DOM_INSPECTION, SCREEN_GUIDES["/dashboard"]);
const aiBadge = buildEvidenceBadge(EVIDENCE_TYPES.AI_GROUNDED_DOCS, SCREEN_GUIDES["/dashboard"], "Groq AI");

console.log(JSON.stringify({
  strongIntent: {
    matchedIntentId: strongIntent.matchedIntentId,
    intentScore: strongIntent.intentScore,
    secondBestScore: strongIntent.secondBestScore,
    matchMargin: strongIntent.matchMargin,
    matchCategory: strongIntent.matchCategory,
    evidenceType: strongIntent.evidenceType,
    confidence: strongIntent.confidence,
    shouldCallAi: strongIntent.shouldCallAi,
  },
  faqMatch: {
    matchedIntentId: faqMatch.matchedIntentId,
    matchCategory: faqMatch.matchCategory,
    shouldCallAi: faqMatch.shouldCallAi,
  },
  screenMatch: {
    matchedIntentId: screenMatch.matchedIntentId,
    matchCategory: screenMatch.matchCategory,
    evidenceType: screenMatch.evidenceType,
    shouldCallAi: screenMatch.shouldCallAi,
  },
  romanUrdu: {
    matchedIntentId: romanUrdu.matchedIntentId,
    matchCategory: romanUrdu.matchCategory,
    shouldCallAi: romanUrdu.shouldCallAi,
  },
  demoReq: {
    startDemoNow: demoReq.startDemoNow,
    workflowId: demoReq.workflowId,
    shouldCallAi: demoReq.shouldCallAi,
    hasManifestSteps: Boolean(manifest && manifest.steps && manifest.steps.length > 0 && manifest.steps[0].target),
  },
  badges: {
    docEn: docBadge.en,
    screenEn: screenBadge.en,
    domEn: domBadge.en,
    aiEn: aiBadge.en,
  },
}));
JS;

        $cmd = escapeshellarg($nodeBinary).' --input-type=module -e '.escapeshellarg($script);
        $output = shell_exec($cmd);
        $this->assertNotNull($output, 'Node evaluation should return JSON output');

        $result = json_decode(trim($output), true);
        $this->assertIsArray($result);

        // 5. Strong local intent match without external AI calls
        $this->assertSame('create_purchase_order', $result['strongIntent']['matchedIntentId']);
        $this->assertSame('strong_intent_match', $result['strongIntent']['matchCategory']);
        $this->assertGreaterThan(65, $result['strongIntent']['intentScore']);
        $this->assertGreaterThan(24, $result['strongIntent']['matchMargin']);
        $this->assertFalse($result['strongIntent']['shouldCallAi']);

        // 6. FAQ matching
        $this->assertSame('faq:/dashboard#0', $result['faqMatch']['matchedIntentId']);
        $this->assertSame('faq_match', $result['faqMatch']['matchCategory']);
        $this->assertFalse($result['faqMatch']['shouldCallAi']);

        // 7. Screen-guide matching
        $this->assertSame('current_screen_overview', $result['screenMatch']['matchedIntentId']);
        $this->assertSame('screen_guide_match', $result['screenMatch']['matchCategory']);
        $this->assertSame('current_screen_context', $result['screenMatch']['evidenceType']);
        $this->assertFalse($result['screenMatch']['shouldCallAi']);

        // 18. Roman Urdu query handling locally
        $this->assertSame('sell_loose_tablets_pack_vs_unit', $result['romanUrdu']['matchedIntentId']);
        $this->assertFalse($result['romanUrdu']['shouldCallAi']);

        // 22. Interactive walkthrough preservation
        $this->assertTrue($result['demoReq']['startDemoNow']);
        $this->assertSame('create_purchase_order', $result['demoReq']['workflowId']);
        $this->assertFalse($result['demoReq']['shouldCallAi']);
        $this->assertTrue($result['demoReq']['hasManifestSteps']);

        // 23. Evidence label accuracy: static docs and screen context are never labeled as "Observed on current screen"
        $this->assertStringContainsString('Documented in Karobar Knowledge Base', $result['badges']['docEn']);
        $this->assertStringNotContainsString('Observed on current screen', $result['badges']['docEn']);
        $this->assertStringContainsString('Current Screen Context', $result['badges']['screenEn']);
        $this->assertStringNotContainsString('Observed on current screen', $result['badges']['screenEn']);
        $this->assertStringContainsString('Live DOM Inspection', $result['badges']['domEn']);
        $this->assertStringContainsString('AI-Assisted Explanation', $result['badges']['aiEn']);
    }

    /**
     * 8, 16, 17. Groq primary success with bilingual English and Urdu structured output.
     */
    public function test_groq_primary_success_returns_structured_english_and_urdu_output(): void
    {
        Http::fake([
            'api.groq.com/*' => Http::response([
                'choices' => [
                    [
                        'message' => [
                            'content' => json_encode([
                                'title_en' => 'How to Record Supplier Expiry Intimation',
                                'title_ur' => 'سپلائر ایکسپائری انٹیمیشن درج کرنے کا طریقہ',
                                'answer_en' => "1. Open **Batch Expiry Report** (`/reports/batch-expiry`).\n2. Filter by your supplier's return policy window and mark the batch as **Intimated**.",
                                'answer_ur' => "1. **Batch Expiry Report** (`/reports/batch-expiry`) کھولیں۔\n2. سپلائر کی پالیسی کے مطابق بیچ کو **Intimated** مارک کریں۔",
                                'source_ids' => ['screen:/suppliers'],
                            ], JSON_UNESCAPED_UNICODE),
                        ],
                    ],
                ],
            ], 200),
            'generativelanguage.googleapis.com/*' => Http::response([], 500),
        ]);

        Sanctum::actingAs($this->user);

        $response = $this->postJson('/api/cube/ask', [
            'question' => 'Please explain in detail how supplier expiry intimation policy works',
            'language' => 'ur',
            'current_route' => '/suppliers',
        ]);

        $response->assertOk()
            ->assertJsonPath('provider', 'groq')
            ->assertJsonPath('provider_status', 'groq_primary')
            ->assertJsonPath('fallback_used', false)
            ->assertJsonPath('evidence_classification', 'ai_grounded_docs')
            ->assertJsonPath('title_en', 'How to Record Supplier Expiry Intimation')
            ->assertJsonPath('title_ur', 'سپلائر ایکسپائری انٹیمیشن درج کرنے کا طریقہ');

        $this->assertStringContainsString('Batch Expiry Report', $response->json('answer_en'));
        $this->assertStringContainsString('سپلائر', $response->json('answer_ur'));

        // Verify Gemini was not called since Groq succeeded
        Http::assertSentCount(1);

        $usage = CubeProviderUsage::where('provider', 'groq')->first();
        $this->assertNotNull($usage);
        $this->assertSame(1, $usage->request_count);
        $this->assertSame(1, $usage->success_count);
        $this->assertSame('ready', $usage->status);
    }

    /**
     * 9. Groq HTTP 429 fallback to Gemini (and respects Retry-After cooldown).
     */
    public function test_groq_http_429_respects_retry_after_and_falls_back_to_gemini(): void
    {
        Http::fake([
            'api.groq.com/*' => Http::response([
                'error' => [
                    'message' => 'Rate limit reached for model',
                    'type' => 'tokens',
                    'code' => 'rate_limit_exceeded',
                ],
            ], 429, ['Retry-After' => '90']),
            'generativelanguage.googleapis.com/*' => Http::response([
                'candidates' => [
                    [
                        'content' => [
                            'parts' => [
                                [
                                    'text' => json_encode([
                                        'title_en' => 'Opening & Closing Cash Drawer Shift',
                                        'title_ur' => 'کیش ڈراور شفٹ کھولنے اور بند کرنے کا طریقہ',
                                        'answer_en' => '1. Open Cash Drawer (`/cash-drawer`) and enter Opening Float.\n2. At shift end, enter physical cash count and print the Z-Report.',
                                        'answer_ur' => '1. کیش ڈراور (`/cash-drawer`) کھول کر ابتدائی رقم لکھیں۔\n2. شفٹ کے اختتام پر نقد رقم گن کر Z-Report پرنٹ کریں۔',
                                        'source_ids' => ['intent:cash_drawer_shift_z_report'],
                                    ], JSON_UNESCAPED_UNICODE),
                                ],
                            ],
                        ],
                    ],
                ],
            ], 200),
        ]);

        Sanctum::actingAs($this->user);

        $response = $this->postJson('/api/cube/ask', [
            'question' => 'Explain cash drawer shift opening and z-report reconciliation in detail',
            'language' => 'en',
            'current_route' => '/cash-drawer',
        ]);

        $response->assertOk()
            ->assertJsonPath('provider', 'gemini')
            ->assertJsonPath('provider_status', 'gemini_backup')
            ->assertJsonPath('fallback_used', true)
            ->assertJsonPath('evidence_classification', 'ai_grounded_docs');

        $groqUsage = CubeProviderUsage::where('provider', 'groq')->first();
        $this->assertNotNull($groqUsage);
        $this->assertSame('rate_limited', $groqUsage->status);
        $this->assertNotNull($groqUsage->cooldown_until);
        $this->assertTrue($groqUsage->cooldown_until->isFuture());
    }

    /**
     * 10. Groq timeout / connection failure fallback to Gemini.
     */
    public function test_groq_timeout_falls_back_to_gemini(): void
    {
        Http::fake([
            'api.groq.com/*' => function () {
                throw new ConnectionException('cURL error 28: Operation timed out');
            },
            'generativelanguage.googleapis.com/*' => Http::response([
                'candidates' => [
                    [
                        'content' => [
                            'parts' => [
                                [
                                    'text' => json_encode([
                                        'title_en' => 'Barcode POS Billing Guide',
                                        'title_ur' => 'بارکوڈ POS بلنگ گائیڈ',
                                        'answer_en' => '1. Scan barcode on POS (`/sale-invoices/pos`).\n2. Press F8 to hold or complete checkout.',
                                        'answer_ur' => '1. بارکوڈ اسکین کریں۔\n2. بل ہولڈ کرنے کے لیے F8 دبائیں۔',
                                        'source_ids' => ['screen:/sale-invoices/pos'],
                                    ], JSON_UNESCAPED_UNICODE),
                                ],
                            ],
                        ],
                    ],
                ],
            ], 200),
        ]);

        Sanctum::actingAs($this->user);

        $response = $this->postJson('/api/cube/ask', [
            'question' => 'How does barcode POS billing and F8 hold bill work in detail?',
            'language' => 'en',
            'current_route' => '/sale-invoices/pos',
        ]);

        $response->assertOk()
            ->assertJsonPath('provider', 'gemini')
            ->assertJsonPath('provider_status', 'gemini_backup')
            ->assertJsonPath('fallback_used', true);
    }

    /**
     * 11. Groq daily limit exhaustion fallback to Gemini without calling Groq HTTP endpoint.
     */
    public function test_groq_daily_limit_exhaustion_falls_back_to_gemini(): void
    {
        config(['cube.providers.groq.daily_limit' => 2]);

        CubeProviderUsage::create([
            'provider' => 'groq',
            'usage_date' => now()->toDateString(),
            'request_count' => 2,
            'success_count' => 2,
            'failure_count' => 0,
            'status' => 'ready',
        ]);

        Http::fake([
            'api.groq.com/*' => Http::response([], 200),
            'generativelanguage.googleapis.com/*' => Http::response([
                'candidates' => [
                    [
                        'content' => [
                            'parts' => [
                                [
                                    'text' => json_encode([
                                        'title_en' => 'Customer Udhar & Ledger Recovery',
                                        'title_ur' => 'کسٹمر ادھار کھاتہ اور وصولی',
                                        'answer_en' => 'Open Customer Ledger (`/customer-ledger`) to record cash/bank recovery.',
                                        'answer_ur' => 'کسٹمر لیجر (`/customer-ledger`) کھول کر وصولی درج کریں۔',
                                        'source_ids' => ['intent:customer_udhar_ledger_payment'],
                                    ], JSON_UNESCAPED_UNICODE),
                                ],
                            ],
                        ],
                    ],
                ],
            ], 200),
        ]);

        Sanctum::actingAs($this->user);

        $response = $this->postJson('/api/cube/ask', [
            'question' => 'Explain customer udhar ledger recovery workflow in detail',
            'language' => 'en',
            'current_route' => '/customer-ledger',
        ]);

        $response->assertOk()
            ->assertJsonPath('provider', 'gemini')
            ->assertJsonPath('provider_status', 'gemini_backup')
            ->assertJsonPath('provider_trace.groq.status', 'quota_exhausted');

        // Groq was skipped before making any HTTP call
        Http::assertSentCount(1);
    }

    /**
     * 12 & 13. Gemini HTTP 429 and both providers unavailable fallback to local knowledge.
     */
    public function test_both_providers_unavailable_or_rate_limited_falls_back_to_local_knowledge(): void
    {
        Http::fake([
            'api.groq.com/*' => Http::response([
                'error' => ['message' => 'Invalid API key provided', 'code' => 'invalid_api_key'],
            ], 401),
            'generativelanguage.googleapis.com/*' => Http::response([
                'error' => ['status' => 'RESOURCE_EXHAUSTED', 'message' => 'Quota exceeded'],
            ], 429, ['Retry-After' => '120']),
        ]);

        Sanctum::actingAs($this->user);

        $response = $this->postJson('/api/cube/ask', [
            'question' => 'How to create a purchase order for low stock medicines?',
            'language' => 'en',
            'current_route' => '/purchase-orders',
        ]);

        $response->assertOk()
            ->assertJsonPath('provider', 'local')
            ->assertJsonPath('provider_status', 'local_fallback')
            ->assertJsonPath('fallback_used', true)
            ->assertJsonPath('evidence_classification', 'documented_info');

        $this->assertNotEmpty($response->json('answer_en'));
        $this->assertNotEmpty($response->json('answer_ur'));

        // Verify Groq was marked disabled_until_reconfigured on 401 auth failure
        $groqUsage = CubeProviderUsage::where('provider', 'groq')->first();
        $this->assertSame('disabled_until_reconfigured', $groqUsage->status);

        // Verify Gemini was marked rate_limited on 429
        $geminiUsage = CubeProviderUsage::where('provider', 'gemini')->first();
        $this->assertSame('rate_limited', $geminiUsage->status);
    }

    /**
     * 14. Missing or zero daily limit disables provider.
     */
    public function test_missing_or_zero_daily_limit_disables_provider(): void
    {
        config([
            'cube.providers.groq.daily_limit' => 0,
            'cube.providers.gemini.daily_limit' => 0,
        ]);

        Http::fake();

        Sanctum::actingAs($this->user);

        $response = $this->postJson('/api/cube/ask', [
            'question' => 'How to add stock via purchase invoice?',
            'language' => 'en',
            'current_route' => '/purchase-invoices/create',
        ]);

        $response->assertOk()
            ->assertJsonPath('provider', 'local')
            ->assertJsonPath('provider_status', 'local_fallback')
            ->assertJsonPath('provider_trace.groq.reason', 'daily_limit_missing_or_zero')
            ->assertJsonPath('provider_trace.gemini.reason', 'daily_limit_missing_or_zero');

        Http::assertNothingSent();
    }

    /**
     * 15. Invalid or unsafe AI output rejected and replaced by fallback.
     */
    public function test_invalid_or_unsafe_ai_output_is_rejected_and_replaced_by_fallback(): void
    {
        Http::fake([
            'api.groq.com/*' => Http::response([
                'choices' => [
                    [
                        'message' => [
                            'content' => json_encode([
                                'title_en' => 'Unsafe Script Test',
                                'title_ur' => 'غیر محفوظ ٹیسٹ',
                                'answer_en' => 'Click here <script>alert("xss")</script> or visit https://malicious.example.com',
                                'answer_ur' => 'یہاں کلک کریں <script>alert(1)</script>',
                                'source_ids' => ['intent:create_purchase_order'],
                            ]),
                        ],
                    ],
                ],
            ], 200),
            'generativelanguage.googleapis.com/*' => Http::response([
                'candidates' => [
                    [
                        'content' => [
                            'parts' => [
                                ['text' => 'NOT_VALID_JSON_AT_ALL'],
                            ],
                        ],
                    ],
                ],
            ], 200),
        ]);

        Sanctum::actingAs($this->user);

        $response = $this->postJson('/api/cube/ask', [
            'question' => 'How to create a purchase order step by step?',
            'language' => 'en',
            'current_route' => '/purchase-orders',
        ]);

        $response->assertOk()
            ->assertJsonPath('provider', 'local')
            ->assertJsonPath('provider_status', 'local_fallback')
            ->assertJsonPath('provider_trace.groq.status', 'invalid_output')
            ->assertJsonPath('provider_trace.gemini.status', 'invalid_output');

        $this->assertStringNotContainsString('<script>', $response->json('answer_en'));
        $this->assertStringNotContainsString('malicious.example.com', $response->json('answer_en'));
    }

    /**
     * 18 & 19. Roman Urdu query handling and follow-up question handling with recent context.
     */
    public function test_roman_urdu_and_followup_question_with_recent_conversation_context(): void
    {
        $capturedPrompt = null;

        Http::fake([
            'api.groq.com/*' => function ($request) use (&$capturedPrompt) {
                $capturedPrompt = $request->data();

                return Http::response([
                    'choices' => [
                        [
                            'message' => [
                                'content' => json_encode([
                                    'title_en' => 'Selling Loose Tablets (Pack vs Unit)',
                                    'title_ur' => 'کھلی گولیاں بیچنے کا طریقہ (ڈبہ بمقابلہ یونٹ)',
                                    'answer_en' => 'When Pack Size is set to 30, selecting Unit mode on POS deducts only the loose tablets sold.',
                                    'answer_ur' => 'جب پیک سائز 30 ہو تو POS پر Unit موڈ منتخب کرنے سے صرف فروخت شدہ کھلی گولیاں اسٹاک سے کم ہوتی ہیں۔',
                                    'source_ids' => ['intent:sell_loose_tablets_pack_vs_unit'],
                                ], JSON_UNESCAPED_UNICODE),
                            ],
                        ],
                    ],
                ], 200);
            },
        ]);

        Sanctum::actingAs($this->user);

        $response = $this->postJson('/api/cube/ask', [
            'question' => 'Aur agar customer 5 khuli goliyan wapas kare toh kya hoga?',
            'language' => 'ur',
            'current_route' => '/sale-invoices/pos',
            'history' => [
                ['role' => 'user', 'content' => 'khuli goliyan kaise bechein? Call me at 0300-1234567'],
                ['role' => 'assistant', 'content' => 'Set Pack Size on the product and choose Unit on POS.'],
            ],
        ]);

        $response->assertOk()
            ->assertJsonPath('provider', 'groq')
            ->assertJsonPath('workflow_id', 'pos_counter_billing');

        $this->assertNotNull($capturedPrompt);
        $userMessageContent = data_get($capturedPrompt, 'messages.1.content', '');
        // Verify recent history was included AND phone number PII was redacted before sending to Groq
        $this->assertStringContainsString('khuli goliyan kaise bechein', $userMessageContent);
        $this->assertStringContainsString('[REDACTED_PHONE]', $userMessageContent);
        $this->assertStringNotContainsString('0300-1234567', $userMessageContent);
    }

    /**
     * 20. Request for live ERP data handled without database disclosure or AI calls.
     */
    public function test_live_erp_data_request_is_handled_without_database_disclosure_or_ai_calls(): void
    {
        Http::fake();

        Sanctum::actingAs($this->user);

        $queriesExecuted = [];
        DB::listen(function ($query) use (&$queriesExecuted) {
            $queriesExecuted[] = strtolower($query->sql);
        });

        $response = $this->postJson('/api/cube/ask', [
            'question' => 'How much stock of Panadol do I have right now and what is the current balance of customer Ali?',
            'language' => 'en',
            'current_route' => '/dashboard',
        ]);

        $response->assertOk()
            ->assertJsonPath('provider', 'local')
            ->assertJsonPath('provider_status', 'local_privacy_boundary')
            ->assertJsonPath('fallback_used', false)
            ->assertJsonPath('evidence_classification', 'documented_info');

        $this->assertStringContainsString('/reports/current-stock', $response->json('answer_en'));
        $this->assertNotEmpty($response->json('links'));

        // External AI providers must NOT be called for live ERP figure queries
        Http::assertNothingSent();

        // Ensure no ERP business tables (products, batches, customers, sale_invoices, accounts, ledgers) were queried
        foreach ($queriesExecuted as $sql) {
            $this->assertDoesNotMatchRegularExpression(
                '/\b(products|batches|customers|suppliers|sale_invoices|purchase_invoices|accounts|journal_entries)\b/',
                $sql
            );
        }
    }

    /**
     * 21. Knowledge exporter output validation.
     */
    public function test_knowledge_exporter_output_is_valid_and_free_of_css_selectors(): void
    {
        $retriever = app(CubeKnowledgeRetriever::class);
        $kb = $retriever->loadKnowledge();

        $this->assertNotEmpty($kb['product_version'] ?? null);
        $this->assertNotEmpty($kb['screens'] ?? []);
        $this->assertNotEmpty($kb['intents'] ?? []);
        $this->assertNotEmpty($kb['workflows'] ?? []);
        $this->assertGreaterThanOrEqual(75, count($kb['screens']));
        $this->assertGreaterThanOrEqual(50, count($kb['intents']));

        // Ensure workflow metadata in cube-knowledge.json does not contain raw CSS target selectors
        foreach ($kb['workflows'] as $wf) {
            foreach (($wf['steps'] ?? []) as $step) {
                $this->assertArrayNotHasKey('target', $step);
                $this->assertArrayNotHasKey('targetSelector', $step);
            }
        }
    }

    /**
     * 24. Cube AI Settings Panel: User can save Groq & Gemini API keys via `/api/settings`,
     * test connectivity via `/api/settings/test-cube-ai`, and `/api/cube/ask` uses the saved DB keys.
     */
    public function test_cube_ai_settings_panel_saves_api_keys_and_powers_cube_ask_without_env(): void
    {
        Permission::firstOrCreate(['name' => 'settings.view', 'guard_name' => 'sanctum']);
        Permission::firstOrCreate(['name' => 'settings.update', 'guard_name' => 'sanctum']);
        $this->user->givePermissionTo(['settings.view', 'settings.update']);

        // Clear any .env / config keys first to prove DB settings alone power Cube AI
        config([
            'cube.providers.groq.api_key' => '',
            'cube.providers.groq.daily_limit' => 0,
            'cube.providers.gemini.api_key' => '',
            'cube.providers.gemini.daily_limit' => 0,
        ]);

        Http::fake([
            'api.groq.com/*' => Http::response([
                'choices' => [
                    [
                        'message' => [
                            'content' => json_encode([
                                'title_en' => 'Connected via DB Settings',
                                'title_ur' => 'ڈیٹا بیس سیٹنگز سے منسلک',
                                'answer_en' => 'Groq key from Settings UI works!',
                                'answer_ur' => 'سیٹنگز پینل کی اے پی آئی کی کامیابی سے کام کر رہی ہے!',
                                'source_ids' => ['intent:create_purchase_order'],
                            ], JSON_UNESCAPED_UNICODE),
                        ],
                    ],
                ],
            ], 200),
        ]);

        Sanctum::actingAs($this->user);

        // 1. Test key via /api/settings/test-cube-ai
        $testResp = $this->postJson('/api/settings/test-cube-ai', [
            'provider' => 'groq',
            'api_key' => 'gsk_ui_saved_key_999999',
            'model' => 'llama-3.1-8b-instant',
        ]);

        $testResp->assertOk()
            ->assertJsonPath('status', 'connected')
            ->assertJsonPath('provider', 'groq');

        // 2. Save settings via POST /api/settings (just like SMTP)
        $saveResp = $this->postJson('/api/settings', [
            'printer_type' => 'thermal',
            'cube_ai_enabled' => true,
            'cube_groq_enabled' => true,
            'cube_groq_api_key' => 'gsk_ui_saved_key_999999',
            'cube_groq_model' => 'llama-3.1-8b-instant',
            'cube_groq_daily_limit' => 300,
            'cube_gemini_enabled' => true,
            'cube_gemini_api_key' => 'AIza_ui_saved_key_888888',
            'cube_gemini_model' => 'gemini-3.8-flash',
            'cube_gemini_daily_limit' => 250,
        ]);

        $saveResp->assertOk()
            ->assertJsonPath('cube_groq_api_key', 'gsk_ui_saved_key_999999')
            ->assertJsonPath('cube_groq_model', 'llama-3.1-8b-instant')
            ->assertJsonPath('cube_groq_daily_limit', 300)
            ->assertJsonPath('cube_gemini_api_key', 'AIza_ui_saved_key_888888');

        // Reset runtime config to empty so we verify CubeAssistantService loads from DB Setting
        config([
            'cube.providers.groq.api_key' => '',
            'cube.providers.groq.daily_limit' => 0,
        ]);

        // 3. Call /api/cube/ask and verify it uses the DB-stored Groq API key
        $askResp = $this->postJson('/api/cube/ask', [
            'question' => 'How to create a purchase order step by step?',
            'language' => 'en',
            'current_route' => '/purchase-orders',
        ]);

        $askResp->assertOk()
            ->assertJsonPath('provider', 'groq')
            ->assertJsonPath('provider_status', 'groq_primary')
            ->assertJsonPath('title_en', 'Connected via DB Settings');
    }

    /**
     * 25. Cube AI Non-Destructive Task Automation & Zero-Assumption Required Field Checks:
     * - Never assumes missing required fields (`name`, `pack_size`, `category`, `brand`, `supplier`) even if AI tries to guess them
     * - Asks the user for the missing required fields and completes creation across follow-up turns
     * - Edits an existing product's price, rack, and formulation
     * - Auto-fills missing formulations across multiple products in background batches
     * - Hardcodes a strict refusal on any delete request (chat or structured endpoint)
     */
    public function test_cube_task_automation_adds_and_edits_products_fills_formulations_in_background_and_hardblocks_delete(): void
    {
        Permission::firstOrCreate(['name' => 'product.create', 'guard_name' => 'sanctum']);
        Permission::firstOrCreate(['name' => 'product.update', 'guard_name' => 'sanctum']);
        $this->user->givePermissionTo(['product.create', 'product.update']);

        Sanctum::actingAs($this->user);

        // Seed existing Brand and Supplier in the catalog (Cube must NEVER create new Brands or Suppliers)
        $existingBrand = \App\Models\Brand::create([
            'name' => 'GSK',
            'expiry_return_policy' => 'before_expiry',
            'expiry_return_months' => 3,
        ]);
        $existingSupplier = \App\Models\Supplier::create([
            'name' => 'Ali Gohar',
        ]);

        // Even if Groq AI tries to assume/guess pack_size=200, brand=GSK, category=Tablets, formulation=Paracetamol
        // when the user only typed "Add product Panadol 500mg Tablet", Cube MUST strip unstated assumptions and ask!
        Http::fake([
            'api.groq.com/*' => Http::sequence()
                ->push([
                    'choices' => [
                        [
                            'message' => [
                                'content' => json_encode([
                                    'action' => 'create_products',
                                    'products' => [
                                        [
                                            'name' => 'Panadol 500mg Tablet',
                                            'formulation' => 'Paracetamol',
                                            'pack_size' => 200,
                                            'brand' => 'GSK',
                                            'category' => 'Tablets',
                                            'supplier' => 'General Supplier',
                                        ],
                                    ],
                                ]),
                            ],
                        ],
                    ],
                ], 200)
                ->push([
                    'choices' => [
                        [
                            'message' => [
                                'content' => json_encode([
                                    'action' => 'update_products',
                                    'updates' => [
                                        [
                                            'target_name_or_code' => 'Panadol 500mg Tablet',
                                            'pack_sale_price' => 640,
                                            'rack' => 'R-22',
                                        ],
                                    ],
                                ]),
                            ],
                        ],
                    ],
                ], 200)
                ->push([
                    'choices' => [
                        [
                            'message' => [
                                'content' => json_encode([
                                    'formulations' => [],
                                ]),
                            ],
                        ],
                    ],
                ], 200),
        ]);

        // 1A. User asks to add a product with ONLY the name -> Cube must NOT assume pack_size, category, brand, or supplier!
        $step1Resp = $this->postJson('/api/cube/ask', [
            'question' => 'Add product Panadol 500mg Tablet',
            'language' => 'en',
            'current_route' => '/products',
        ]);

        $step1Resp->assertOk()
            ->assertJsonPath('provider_status', 'cube_task_needs_input')
            ->assertJsonPath('task_meta.action', 'create_products')
            ->assertJsonPath('task_meta.status', 'needs_required_fields')
            ->assertJsonPath('task_meta.created_count', 0)
            ->assertJsonPath('task_meta.missing_fields', ['pack_size', 'category', 'brand', 'supplier'])
            ->assertJsonPath('task_meta.collected_fields.name', 'Panadol 500mg Tablet');

        // Product must NOT be created yet in DB
        $this->assertNull(\App\Models\Product::where('name', 'Panadol 500mg Tablet')->first());

        // 1B. User replies with pack_size, category, and NON-EXISTENT brand & supplier -> Cube must NEVER create new Brand or Supplier!
        $step2Resp = $this->postJson('/api/cube/ask', [
            'question' => 'pack size 200, category Tablets, brand NonExistentBrandXYZ, supplier NonExistentSupplierXYZ',
            'language' => 'en',
            'current_route' => '/products',
        ]);

        $step2Resp->assertOk()
            ->assertJsonPath('provider_status', 'cube_task_needs_input')
            ->assertJsonPath('task_meta.missing_fields', ['brand', 'supplier'])
            ->assertJsonPath('task_meta.invalid_brand', 'NonExistentBrandXYZ')
            ->assertJsonPath('task_meta.invalid_supplier', 'NonExistentSupplierXYZ')
            ->assertJsonPath('task_meta.collected_fields.name', 'Panadol 500mg Tablet')
            ->assertJsonPath('task_meta.collected_fields.pack_size', 200)
            ->assertJsonPath('task_meta.collected_fields.category', 'Tablets');

        // Verify no new Brand or Supplier was created, and product was not created yet
        $this->assertFalse(\App\Models\Brand::where('name', 'NonExistentBrandXYZ')->exists());
        $this->assertFalse(\App\Models\Supplier::where('name', 'NonExistentSupplierXYZ')->exists());
        $this->assertSame(1, \App\Models\Brand::count());
        $this->assertSame(1, \App\Models\Supplier::count());
        $this->assertNull(\App\Models\Product::where('name', 'Panadol 500mg Tablet')->first());

        // 1C. User replies with the EXISTING brand & supplier + optional prices/formulation/rack -> Cube MUST ask for User Permission before creating!
        $permissionCreateResp = $this->postJson('/api/cube/ask', [
            'question' => 'brand GSK, supplier Ali Gohar, formulation Paracetamol, pack purchase price 500, pack sale price 600, rack R-10',
            'language' => 'en',
            'current_route' => '/products',
        ]);

        $permissionCreateResp->assertOk()
            ->assertJsonPath('provider_status', 'cube_task_awaiting_permission')
            ->assertJsonPath('task_meta.action', 'create_products')
            ->assertJsonPath('task_meta.status', 'awaiting_permission')
            ->assertJsonPath('task_meta.requires_permission', true)
            ->assertJsonPath('task_meta.created_count', 0);

        // Product must still NOT be created before user grants permission
        $this->assertNull(\App\Models\Product::where('name', 'Panadol 500mg Tablet')->first());

        // 1D. User grants permission -> Product is now created and result summary is returned!
        $createResp = $this->postJson('/api/cube/ask', [
            'question' => 'Yes, approve and execute task',
            'language' => 'en',
            'current_route' => '/products',
            'user_confirmed' => true,
        ]);

        $createResp->assertOk()
            ->assertJsonPath('provider_status', 'cube_task_executed')
            ->assertJsonPath('task_meta.action', 'create_products')
            ->assertJsonPath('task_meta.status', 'completed')
            ->assertJsonPath('task_meta.permission_granted', true)
            ->assertJsonPath('task_meta.created_count', 1)
            ->assertJsonPath('task_meta.result_summary.affected_count', 1);

        $panadol = \App\Models\Product::where('name', 'Panadol 500mg Tablet')->first();
        $this->assertNotNull($panadol);
        $this->assertSame($existingBrand->id, (int) $panadol->brand_id);
        $this->assertSame($existingSupplier->id, (int) $panadol->supplier_id);
        $this->assertSame(1, \App\Models\Brand::count());
        $this->assertSame(1, \App\Models\Supplier::count());
        $this->assertSame('Paracetamol', $panadol->formulation);
        $this->assertSame(200, (int) $panadol->pack_size);
        $this->assertEquals(600.0, (float) $panadol->pack_sale_price);
        $this->assertEquals(3.0, (float) $panadol->unit_sale_price);
        $this->assertSame('R-10', $panadol->rack);

        // 2A. Edit the existing product via Cube -> Cube MUST ask for User Permission first!
        $permissionEditResp = $this->postJson('/api/cube/ask', [
            'question' => 'Update product Panadol 500mg Tablet pack sale price to 640 and rack to R-22',
            'language' => 'en',
            'current_route' => '/products',
        ]);

        $permissionEditResp->assertOk()
            ->assertJsonPath('provider_status', 'cube_task_awaiting_permission')
            ->assertJsonPath('task_meta.action', 'update_products')
            ->assertJsonPath('task_meta.status', 'awaiting_permission')
            ->assertJsonPath('task_meta.requires_permission', true)
            ->assertJsonPath('task_meta.updated_count', 0);

        // Verify product is NOT modified before user grants permission
        $panadol->refresh();
        $this->assertEquals(600.0, (float) $panadol->pack_sale_price);
        $this->assertSame('R-10', $panadol->rack);

        // 2B. User replies "yes" in chat to grant permission -> Product update executes and shows result!
        $editResp = $this->postJson('/api/cube/ask', [
            'question' => 'yes',
            'language' => 'en',
            'current_route' => '/products',
        ]);

        $editResp->assertOk()
            ->assertJsonPath('provider_status', 'cube_task_executed')
            ->assertJsonPath('task_meta.action', 'update_products')
            ->assertJsonPath('task_meta.status', 'completed')
            ->assertJsonPath('task_meta.permission_granted', true)
            ->assertJsonPath('task_meta.updated_count', 1)
            ->assertJsonPath('task_meta.result_summary.affected_count', 1);

        $panadol->refresh();
        $this->assertEquals(640.0, (float) $panadol->pack_sale_price);
        $this->assertEquals(3.2, (float) $panadol->unit_sale_price);
        $this->assertSame('R-22', $panadol->rack);

        // 3. Seed multiple products without formulations and run background bulk formulation enrichment
        \App\Models\Product::create([
            'product_code' => 'PRD-9001',
            'barcode' => 'PRD9000000001',
            'name' => 'Augmentin 625mg Tablet',
            'formulation' => null,
            'pack_size' => 6,
            'narcotic' => 'no',
            'category_id' => $panadol->category_id,
            'brand_id' => $panadol->brand_id,
            'supplier_id' => $panadol->supplier_id,
        ]);
        \App\Models\Product::create([
            'product_code' => 'PRD-9002',
            'barcode' => 'PRD9000000002',
            'name' => 'Brufen 400mg Tablet',
            'formulation' => '',
            'pack_size' => 30,
            'narcotic' => 'no',
            'category_id' => $panadol->category_id,
            'brand_id' => $panadol->brand_id,
            'supplier_id' => $panadol->supplier_id,
        ]);
        \App\Models\Product::create([
            'product_code' => 'PRD-9003',
            'barcode' => 'PRD9000000003',
            'name' => 'Betnovate N Lotion 60ml',
            'formulation' => null,
            'pack_size' => 1,
            'narcotic' => 'no',
            'category_id' => $panadol->category_id,
            'brand_id' => $panadol->brand_id,
            'supplier_id' => $panadol->supplier_id,
        ]);
        $unverifiedProd = \App\Models\Product::create([
            'product_code' => 'PRD-9004',
            'barcode' => 'PRD9000000004',
            'name' => 'Brozinil UnknownBrand 250mg Tablet',
            'formulation' => null,
            'pack_size' => 10,
            'narcotic' => 'no',
            'category_id' => $panadol->category_id,
            'brand_id' => $panadol->brand_id,
            'supplier_id' => $panadol->supplier_id,
        ]);

        // Run batch 1 with batch_size=2 via /api/cube/execute-task to verify multi-batch background support
        $batch1Resp = $this->postJson('/api/cube/execute-task', [
            'task_type' => 'bulk_autofill_missing_formulations',
            'batch_size' => 2,
            'after_id' => 0,
        ]);

        $batch1Resp->assertOk()
            ->assertJsonPath('task_meta.action', 'bulk_autofill_missing_formulations')
            ->assertJsonPath('task_meta.updated_count', 2)
            ->assertJsonPath('background_task.has_more', true)
            ->assertJsonPath('background_task.remaining_count', 2);

        $lastId = (int) $batch1Resp->json('background_task.last_processed_id');

        // Run batch 2 to process the remaining 2 products (1 verified variant + 1 unverified brand that must NOT be guessed)
        $batch2Resp = $this->postJson('/api/cube/execute-task', [
            'task_type' => 'bulk_autofill_missing_formulations',
            'batch_size' => 2,
            'after_id' => $lastId,
        ]);

        $batch2Resp->assertOk()
            ->assertJsonPath('task_meta.updated_count', 1)
            ->assertJsonPath('background_task.has_more', false)
            ->assertJsonPath('background_task.remaining_count', 0);

        $this->assertSame('Amoxicillin + Clavulanic Acid', \App\Models\Product::where('product_code', 'PRD-9001')->value('formulation'));
        $this->assertSame('Ibuprofen', \App\Models\Product::where('product_code', 'PRD-9002')->value('formulation'));
        $this->assertSame('Betamethasone Valerate + Neomycin Sulfate', \App\Models\Product::where('product_code', 'PRD-9003')->value('formulation'));
        // Unverified trade name must remain null (never guessed!)
        $this->assertNull(\App\Models\Product::where('product_code', 'PRD-9004')->value('formulation'));

        // 4. Hardcoded non-destructive check: Delete requests are strictly blocked in both chat and structured endpoint
        $deleteChatResp = $this->postJson('/api/cube/ask', [
            'question' => 'Delete product Panadol 500mg Tablet',
            'language' => 'en',
            'current_route' => '/products',
        ]);

        $deleteChatResp->assertOk()
            ->assertJsonPath('provider_status', 'cube_task_delete_blocked')
            ->assertJsonPath('task_meta.action', 'delete_blocked')
            ->assertJsonPath('task_meta.blocked', true);

        $deleteTaskResp = $this->postJson('/api/cube/execute-task', [
            'task_type' => 'delete_products',
        ]);

        $deleteTaskResp->assertOk()
            ->assertJsonPath('provider_status', 'cube_task_delete_blocked')
            ->assertJsonPath('task_meta.blocked', true);

        // Verify Panadol still exists in the database
        $this->assertNotNull(\App\Models\Product::where('name', 'Panadol 500mg Tablet')->first());
    }

    /**
     * 26. Explain Cursor & Self-Improving Knowledge Base:
     * - Explain Cursor sends `explain_mode = cursor_element` and `element_context` to Generative AI
     * - Generative AI explains the control and improves old static knowledge (`knowledge_improved = true`)
     * - Subsequent queries (even if AI is later offline/disabled) return the AI-improved knowledge instead of stale old knowledge
     * - Gemma models (`gemma-4-26b-a4b-it`) work seamlessly in compatibility mode without `system_instruction` HTTP 400 errors
     */
    public function test_explain_cursor_uses_generative_ai_and_self_improves_old_knowledge_for_future_queries(): void
    {
        Sanctum::actingAs($this->user);

        config([
            'cube.providers.groq.model' => 'openai/gpt-oss-120b',
            'cube.providers.gemini.model' => 'gemma-4-26b-a4b-it',
        ]);

        $capturedGroqPayload = null;

        Http::fake([
            'api.groq.com/*' => function ($request) use (&$capturedGroqPayload) {
                $capturedGroqPayload = $request->data();

                return Http::response([
                    'choices' => [
                        [
                            'message' => [
                                'content' => json_encode([
                                    'title_en' => 'Regular Customer Toggle — Auto-Fill Repeat Prescriptions',
                                    'title_ur' => 'ریگولر کسٹمر بٹن — مستقل گاہکوں کا خودکار بل',
                                    'answer_en' => '1. Clicking **Regular Customer** on the POS loads all medicines marked as Regular for that patient.\n2. It automatically selects the earliest-expiring batch (FEFO) and improves checkout speed.',
                                    'answer_ur' => '1. پی او ایس پر **Regular Customer** بٹن دبانے سے مستقل مریض کی تمام ادویات خودکار طور پر بل میں شامل ہو جاتی ہیں۔\n2. یہ خودکار طور پر FEFO کے مطابق بیچ منتخب کرتا ہے۔',
                                    'source_ids' => ['screen:/sale-invoices/pos'],
                                ], JSON_UNESCAPED_UNICODE),
                            ],
                        ],
                    ],
                ], 200);
            },
        ]);

        // 1. Explain Cursor clicks a button and calls /api/cube/ask with explain_mode=cursor_element & element_context
        $cursorResp = $this->postJson('/api/cube/ask', [
            'question' => 'Explain the "Regular Customer" (Button) on the Barcode POS screen in Karobar ERP.',
            'language' => 'en',
            'current_route' => '/sale-invoices/pos',
            'explain_mode' => 'cursor_element',
            'element_context' => [
                'control_key' => '/sale-invoices/pos::button::regular customer',
                'label' => 'Regular Customer',
                'component_type' => 'Button',
                'zone' => 'Main Workspace',
                'shortcut' => 'Alt+R',
                'baseline_en' => 'Triggers the Regular Customer action.',
                'baseline_ur' => 'یہ بٹن دبانے سے عمل شروع ہوتا ہے۔',
            ],
        ]);

        $cursorResp->assertOk()
            ->assertJsonPath('provider', 'groq')
            ->assertJsonPath('provider_status', 'groq_primary')
            ->assertJsonPath('knowledge_improved', true)
            ->assertJsonPath('title_en', 'Regular Customer Toggle — Auto-Fill Repeat Prescriptions');

        $this->assertNotNull($capturedGroqPayload);
        // Verify gpt-oss-120b did not force response_format=json_object
        $this->assertArrayNotHasKey('response_format', $capturedGroqPayload);
        $userPromptSent = (string) data_get($capturedGroqPayload, 'messages.1.content', '');
        $this->assertStringContainsString('INSPECTED UI ELEMENT / CONTROL CONTEXT', $userPromptSent);
        $this->assertStringContainsString('Regular Customer', $userPromptSent);

        // 2. Now disable external AI providers to verify that the self-improved knowledge replaced the old static fallback!
        config([
            'cube.providers.groq.daily_limit' => 0,
            'cube.providers.gemini.daily_limit' => 0,
        ]);

        $offlineResp = $this->postJson('/api/cube/ask', [
            'question' => 'Explain the "Regular Customer" (Button) on the Barcode POS screen in Karobar ERP.',
            'language' => 'en',
            'current_route' => '/sale-invoices/pos',
            'explain_mode' => 'cursor_element',
            'element_context' => [
                'control_key' => '/sale-invoices/pos::button::regular customer',
                'label' => 'Regular Customer',
                'component_type' => 'Button',
            ],
        ]);

        $offlineResp->assertOk()
            ->assertJsonPath('provider', 'local')
            ->assertJsonPath('provider_status', 'local_fallback');

        $this->assertStringContainsString(
            'loads all medicines marked as Regular for that patient',
            (string) $offlineResp->json('answer_en')
        );
    }

    /**
     * 27. Pre-Database Staged Result Preview & Permission Guard for All ERP Tasks:
     * - Every task (Brands, Categories, Suppliers, Customers, Demands, Products, Formulations)
     *   returns `task_meta.preview_result` (`staged = true`, `posted_to_database = false`) BEFORE writing to DB.
     * - Nothing is written to the database until explicit user permission is granted.
     */
    public function test_cube_interactive_tasks_show_staged_preview_result_before_posting_to_database(): void
    {
        $adminRole = \Spatie\Permission\Models\Role::firstOrCreate(['name' => 'Admin', 'guard_name' => 'sanctum']);
        $this->user->assignRole($adminRole);
        Sanctum::actingAs($this->user);

        // 1. Ask Cube to add a Brand -> must stage preview_result and NOT write to DB yet
        $brandStageResp = $this->postJson('/api/cube/ask', [
            'question' => 'Add brand Abbott Laboratories',
            'language' => 'en',
            'current_route' => '/brands',
        ]);

        $brandStageResp->assertOk()
            ->assertJsonPath('provider_status', 'cube_task_awaiting_permission')
            ->assertJsonPath('task_meta.action', 'create_brands')
            ->assertJsonPath('task_meta.awaiting_permission', true)
            ->assertJsonPath('task_meta.preview_result.staged', true)
            ->assertJsonPath('task_meta.preview_result.posted_to_database', false)
            ->assertJsonPath('task_meta.preview_result.database_table', 'brands')
            ->assertJsonPath('task_meta.preview_result.operation', 'INSERT');

        $this->assertNull(\App\Models\Brand::where('name', 'Abbott Laboratories')->first());

        // 2. Grant permission -> now posted to database
        $brandCommitResp = $this->postJson('/api/cube/ask', [
            'question' => 'Yes, approve and post to database',
            'language' => 'en',
            'current_route' => '/brands',
            'user_confirmed' => true,
        ]);

        $brandCommitResp->assertOk()
            ->assertJsonPath('provider_status', 'cube_task_executed')
            ->assertJsonPath('task_meta.action', 'create_brands')
            ->assertJsonPath('task_meta.result_summary.posted_to_database', true)
            ->assertJsonPath('task_meta.result_summary.database_table', 'brands');

        $this->assertNotNull(\App\Models\Brand::where('name', 'Abbott Laboratories')->first());

        // 3. Ask Cube to add a Supplier -> must stage preview_result and NOT write to DB yet
        $supplierStageResp = $this->postJson('/api/cube/ask', [
            'question' => 'Add supplier Premier Pharma Distributors, phone 03001112233, address Lahore',
            'language' => 'en',
            'current_route' => '/suppliers',
        ]);

        $supplierStageResp->assertOk()
            ->assertJsonPath('provider_status', 'cube_task_awaiting_permission')
            ->assertJsonPath('task_meta.action', 'create_suppliers')
            ->assertJsonPath('task_meta.preview_result.posted_to_database', false)
            ->assertJsonPath('task_meta.preview_result.database_table', 'suppliers');

        $this->assertNull(\App\Models\Supplier::where('name', 'Premier Pharma Distributors')->first());

        // Confirm Supplier creation
        $supplierCommitResp = $this->postJson('/api/cube/ask', [
            'question' => 'yes',
            'language' => 'en',
            'current_route' => '/suppliers',
            'user_confirmed' => true,
        ]);

        $supplierCommitResp->assertOk()
            ->assertJsonPath('provider_status', 'cube_task_executed')
            ->assertJsonPath('task_meta.result_summary.posted_to_database', true);

        $createdSupplier = \App\Models\Supplier::where('name', 'Premier Pharma Distributors')->first();
        $this->assertNotNull($createdSupplier);
        $this->assertSame('03001112233', $createdSupplier->phone);

        // 4. Dry-run preview_only on /api/cube/execute-task must return staged preview without saving to DB
        $cat = \App\Models\Category::firstOrCreate(['name' => 'Syrups']);
        $brand = \App\Models\Brand::where('name', 'Abbott Laboratories')->first();
        $dryRunProd = \App\Models\Product::create([
            'name' => 'Calpol 120mg Syrup',
            'product_code' => 'PRD-9910',
            'barcode' => 'PRD0000009910',
            'formulation' => null,
            'pack_size' => 1,
            'quantity' => 0,
            'pack_purchase_price' => 80,
            'pack_sale_price' => 100,
            'unit_purchase_price' => 80,
            'unit_sale_price' => 100,
            'category_id' => $cat->id,
            'brand_id' => $brand->id,
            'supplier_id' => $createdSupplier->id,
        ]);

        $previewOnlyResp = $this->postJson('/api/cube/execute-task', [
            'task_type' => 'bulk_autofill_missing_formulations',
            'filter_query' => 'Calpol',
            'preview_only' => true,
        ]);

        $previewOnlyResp->assertOk()
            ->assertJsonPath('provider_status', 'cube_task_awaiting_permission')
            ->assertJsonPath('task_meta.preview_result.posted_to_database', false)
            ->assertJsonPath('task_meta.preview_result.resolvable_in_preview', 1);

        // Verify dryRunProd was NOT modified in DB during preview_only
        $this->assertNull($dryRunProd->fresh()->formulation);
    }

    /**
     * 28. Step-by-Step Task Execution & DB-First Matching (Never Excessively Create Duplicate Items):
     * - User Demand: Step 1 asks product name -> Step 2 searches DB first and presents matching products (`db_matches`)
     *   -> Step 3 asks requested quantity -> Step 4 shows staged `preview_result` and asks permission -> Commits linked demand without creating a duplicate product.
     * - Master Entities & Products: Searches DB first when adding a Brand or Product and presents existing matches so the user can select existing or create new.
     */
    public function test_cube_step_by_step_task_execution_searches_database_first_and_prevents_excessive_duplicate_creation(): void
    {
        $adminRole = \Spatie\Permission\Models\Role::firstOrCreate(['name' => 'Admin', 'guard_name' => 'sanctum']);
        $this->user->assignRole($adminRole);
        Sanctum::actingAs($this->user);

        $cat = \App\Models\Category::create(['name' => 'Tablets']);
        $brand = \App\Models\Brand::create([
            'name' => 'GSK Pakistan',
            'expiry_return_policy' => 'before_expiry',
            'expiry_return_months' => 3,
        ]);
        $supplier = \App\Models\Supplier::create([
            'name' => 'Ali Gohar Distributors',
            'phone' => '03009998877',
            'address' => 'Karachi',
        ]);

        $panadol = \App\Models\Product::create([
            'name' => 'Panadol 500mg Tablet',
            'product_code' => 'PRD-0101',
            'barcode' => 'PRD0000000101',
            'formulation' => 'Paracetamol',
            'pack_size' => 200,
            'quantity' => 45,
            'pack_purchase_price' => 500,
            'pack_sale_price' => 600,
            'unit_purchase_price' => 2.5,
            'unit_sale_price' => 3.0,
            'category_id' => $cat->id,
            'brand_id' => $brand->id,
            'supplier_id' => $supplier->id,
        ]);

        // 1. Step 1 of Create User Demand: Ask for product name first
        $demandStep1 = $this->postJson('/api/cube/ask', [
            'question' => 'Create user demand',
            'language' => 'en',
            'current_route' => '/user-demands',
        ]);

        $demandStep1->assertOk()
            ->assertJsonPath('provider_status', 'cube_task_needs_input')
            ->assertJsonPath('task_meta.action', 'create_user_demands')
            ->assertJsonPath('task_meta.step_info.current', 1);

        // 2. Step 2 of Create User Demand: User provides "Panadol" -> Cube searches DB first and presents Panadol 500mg Tablet!
        $demandStep2 = $this->postJson('/api/cube/ask', [
            'question' => 'Panadol',
            'language' => 'en',
            'current_route' => '/user-demands',
        ]);

        $demandStep2->assertOk()
            ->assertJsonPath('provider_status', 'cube_task_needs_input')
            ->assertJsonPath('task_meta.action', 'create_user_demands')
            ->assertJsonPath('task_meta.step_info.current', 2)
            ->assertJsonPath('task_meta.db_matches.0.id', $panadol->id)
            ->assertJsonPath('task_meta.db_matches.0.name', 'Panadol 500mg Tablet');

        // 3. Step 3 of Create User Demand: User selects the matching DB product -> Cube asks for Requested Quantity
        $demandStep3 = $this->postJson('/api/cube/ask', [
            'question' => "Select product #{$panadol->id}: Panadol 500mg Tablet",
            'language' => 'en',
            'current_route' => '/user-demands',
        ]);

        $demandStep3->assertOk()
            ->assertJsonPath('provider_status', 'cube_task_needs_input')
            ->assertJsonPath('task_meta.action', 'create_user_demands')
            ->assertJsonPath('task_meta.step_info.current', 3);

        // 4. Step 4 of Create User Demand: User provides quantity -> Cube stages preview_result and asks permission
        $demandStep4 = $this->postJson('/api/cube/ask', [
            'question' => 'quantity 5',
            'language' => 'en',
            'current_route' => '/user-demands',
        ]);

        $demandStep4->assertOk()
            ->assertJsonPath('provider_status', 'cube_task_awaiting_permission')
            ->assertJsonPath('task_meta.action', 'create_user_demands')
            ->assertJsonPath('task_meta.preview_result.posted_to_database', false)
            ->assertJsonPath('task_meta.preview_result.database_table', 'user_demands');

        $this->assertSame(0, \App\Models\UserDemand::count());

        // 5. Grant permission -> UserDemand is created linked to existing Product ID, and NO new Product was created!
        $demandCommit = $this->postJson('/api/cube/ask', [
            'question' => 'Yes, approve and post to database',
            'language' => 'en',
            'current_route' => '/user-demands',
            'user_confirmed' => true,
        ]);

        $demandCommit->assertOk()
            ->assertJsonPath('provider_status', 'cube_task_executed')
            ->assertJsonPath('task_meta.result_summary.posted_to_database', true);

        $this->assertSame(1, \App\Models\UserDemand::count());
        $this->assertSame(1, \App\Models\Product::count());
        $createdDemand = \App\Models\UserDemand::first();
        $this->assertSame($panadol->id, (int) $createdDemand->product_id);
        $this->assertSame(5, (int) $createdDemand->requested_quantity);

        // 6. DB-First Duplicate Prevention on Brands: Asking to "Add brand GSK" presents existing "GSK Pakistan" from DB first!
        $brandMatchResp = $this->postJson('/api/cube/ask', [
            'question' => 'Add brand GSK',
            'language' => 'en',
            'current_route' => '/brands',
        ]);

        $brandMatchResp->assertOk()
            ->assertJsonPath('provider_status', 'cube_task_needs_input')
            ->assertJsonPath('task_meta.action', 'create_brands')
            ->assertJsonPath('task_meta.db_matches.0.id', $brand->id)
            ->assertJsonPath('task_meta.db_matches.0.name', 'GSK Pakistan');

        // User chooses to use existing Brand -> No duplicate brand is created!
        $brandSelectExisting = $this->postJson('/api/cube/ask', [
            'question' => "Select existing #{$brand->id}: GSK Pakistan",
            'language' => 'en',
            'current_route' => '/brands',
        ]);

        $brandSelectExisting->assertOk()
            ->assertJsonPath('provider_status', 'cube_task_executed')
            ->assertJsonPath('task_meta.created_count', 0)
            ->assertJsonPath('task_meta.selected_existing.id', $brand->id);

        $this->assertSame(1, \App\Models\Brand::count());
    }
}
