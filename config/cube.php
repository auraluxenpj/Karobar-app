<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Cube Hybrid AI Assistant Configuration (Free-Quota Only)
    |--------------------------------------------------------------------------
    |
    | Layer 1: Local trained intelligence engine (frontend + backend fallback)
    | Layer 2: Groq API (Primary generative AI — Free tier only)
    | Layer 3: Google Gemini Developer API (Backup generative AI — Free tier only)
    | Layer 4: Local knowledge base deterministic fallback
    |
    | Paid plans, automatic billing, and unlimited external quotas are strictly
    | prohibited. If a provider's daily limit is missing or <= 0, that provider
    | is automatically disabled.
    |
    */

    'ai_enabled' => filter_var(env('CUBE_AI_ENABLED', true), FILTER_VALIDATE_BOOLEAN),

    // Enforces strict free-tier model allowlists and mandatory positive daily limits.
    'free_only' => filter_var(env('CUBE_FREE_ONLY', true), FILTER_VALIDATE_BOOLEAN),

    'primary_provider' => env('CUBE_PRIMARY_PROVIDER', 'groq'),
    'backup_provider' => env('CUBE_BACKUP_PROVIDER', 'gemini'),

    'knowledge_path' => resource_path('assistant/cube-knowledge.json'),
    'learned_knowledge_path' => env('APP_ENV') === 'testing'
        ? storage_path('framework/testing/cube-learned-knowledge.json')
        : storage_path('app/cube-learned-knowledge.json'),

    'max_question_length' => 2000,
    'max_history_messages' => 6,
    'max_retrieved_sections' => 4,

    // Default cooldown in seconds when HTTP 429 is returned without a Retry-After header
    'default_rate_limit_cooldown_seconds' => (int) env('CUBE_RATE_LIMIT_COOLDOWN', 120),

    'providers' => [
        'groq' => [
            'enabled' => filter_var(env('GROQ_ENABLED', true), FILTER_VALIDATE_BOOLEAN),
            'api_key' => (string) env('GROQ_API_KEY', ''),
            'model' => (string) (env('GROQ_MODEL') ?: 'openai/gpt-oss-120b'),
            // If missing or <= 0, provider is disabled by CubeQuotaGuard
            'daily_limit' => (int) env('GROQ_DAILY_LIMIT', 0),
            'max_daily_free_cap' => 1000,
            'endpoint' => env('GROQ_API_ENDPOINT', 'https://api.groq.com/openai/v1/chat/completions'),
            'models_endpoint' => env('GROQ_MODELS_ENDPOINT', 'https://api.groq.com/openai/v1/models'),
            'timeout_seconds' => (int) env('GROQ_TIMEOUT_SECONDS', 25),
            'connect_timeout_seconds' => (int) env('GROQ_CONNECT_TIMEOUT_SECONDS', 10),
            'max_output_tokens' => 4096,
            'temperature' => 0.3,
            'allowed_free_models' => [
                'openai/gpt-oss-120b',
                'openai/gpt-oss-20b',
                'qwen/qwen3.8-27b',
                'groq/compound',
                'groq/compound-mini',
                'moonshotai/kimi-k2-instruct-0905',
                'moonshotai/kimi-k2-instruct',
                'meta-llama/llama-4-maverick-17b-128e-instruct',
                'meta-llama/llama-4-scout-17b-16e-instruct',
                'llama-3.3-70b-versatile',
                'llama-3.1-8b-instant',
                'qwen/qwen3-32b',
                'deepseek-r1-distill-llama-70b',
                'gemma2-9b-it',
                'mixtral-8x7b-32768',
            ],
        ],

        'gemini' => [
            'enabled' => filter_var(env('GEMINI_ENABLED', true), FILTER_VALIDATE_BOOLEAN),
            'api_key' => (string) env('GEMINI_API_KEY', ''),
            'model' => (string) (env('GEMINI_MODEL') ?: 'gemini-3.8-flash'),
            // If missing or <= 0, provider is disabled by CubeQuotaGuard
            'daily_limit' => (int) env('GEMINI_DAILY_LIMIT', 0),
            'max_daily_free_cap' => 1000,
            'endpoint_base' => env('GEMINI_API_ENDPOINT_BASE', 'https://generativelanguage.googleapis.com/v1beta/models'),
            'timeout_seconds' => (int) env('GEMINI_TIMEOUT_SECONDS', 25),
            'connect_timeout_seconds' => (int) env('GEMINI_CONNECT_TIMEOUT_SECONDS', 10),
            'max_output_tokens' => 4096,
            'temperature' => 0.3,
            'allowed_free_models' => [
                'gemini-3.8-flash',
                'gemini-3.5-flash-lite',
                'gemini-3.1-flash-lite',
                'gemini-2.5-flash',
                'gemini-2.5-flash-lite',
                'gemini-2.0-flash',
                'gemma-4-31b-it',
                'gemma-4-26b-a4b-it',
                'gemma-3-27b-it',
            ],
        ],
    ],
];
