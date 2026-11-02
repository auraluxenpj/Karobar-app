<?php

namespace App\Http\Controllers;

use App\Services\Cube\CubeAssistantService;
use App\Services\Cube\CubeKnowledgeRetriever;
use App\Services\Cube\CubeTaskExecutorService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CubeAssistantController extends Controller
{
    public function __construct(
        protected CubeAssistantService $assistantService,
        protected CubeTaskExecutorService $taskExecutor,
        protected CubeKnowledgeRetriever $retriever,
    ) {}

    public function ask(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'question' => ['required', 'string', 'min:1', 'max:2000'],
            'language' => ['nullable', 'string', 'in:en,ur,both'],
            'current_route' => ['nullable', 'string', 'max:160', 'regex:/^\/[A-Za-z0-9\/_\-:?=&]*$/'],
            'history' => ['nullable', 'array', 'max:6'],
            'history.*.role' => ['required_with:history', 'string', 'in:user,assistant'],
            'history.*.content' => ['required_with:history', 'string', 'max:2000'],
            'matched_intent_id' => ['nullable', 'string', 'max:120'],
            'screen_guide_id' => ['nullable', 'string', 'max:160'],
            'explain_mode' => ['nullable', 'string', 'in:qa,cursor_element,screen_topic'],
            'user_confirmed' => ['nullable', 'boolean'],
            'element_context' => ['nullable', 'array'],
            'element_context.control_key' => ['nullable', 'string', 'max:240'],
            'element_context.label' => ['nullable', 'string', 'max:240'],
            'element_context.component_type' => ['nullable', 'string', 'max:120'],
            'element_context.zone' => ['nullable', 'string', 'max:120'],
            'element_context.table_column' => ['nullable', 'string', 'max:160'],
            'element_context.placeholder' => ['nullable', 'string', 'max:200'],
            'element_context.shortcut' => ['nullable', 'string', 'max:80'],
            'element_context.nearby_headings' => ['nullable', 'string', 'max:500'],
            'element_context.baseline_en' => ['nullable', 'string', 'max:2000'],
            'element_context.baseline_ur' => ['nullable', 'string', 'max:2000'],

            // Security: strictly reject arbitrary provider names, navigation URLs, action IDs, or CSS selectors from frontend
            'provider' => ['prohibited'],
            'model' => ['prohibited'],
            'api_key' => ['prohibited'],
            'navigation_url' => ['prohibited'],
            'navigation_urls' => ['prohibited'],
            'links' => ['prohibited'],
            'action_id' => ['prohibited'],
            'workflow_id' => ['prohibited'],
            'selector' => ['prohibited'],
            'css_selector' => ['prohibited'],
            'target' => ['prohibited'],
            'target_selector' => ['prohibited'],
            'dom_target' => ['prohibited'],
        ]);

        $response = $this->assistantService->ask($validated, $request->user());

        return response()->json($response);
    }

    /**
     * POST /api/cube/execute-task
     * Executes a non-destructive Cube task (such as background batch formulation enrichment,
     * adding products, or editing products). Deleting records is hardcoded to be refused.
     */
    public function executeTask(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'task_type' => ['required', 'string', 'max:80'],
            'batch_size' => ['nullable', 'integer', 'min:1', 'max:30'],
            'after_id' => ['nullable', 'integer', 'min:0'],
            'filter_query' => ['nullable', 'string', 'max:160'],
            'products' => ['nullable', 'array', 'max:25'],
            'updates' => ['nullable', 'array', 'max:25'],
            'assignments' => ['nullable', 'array', 'max:50'],
            'standalone_formulations' => ['nullable', 'array', 'max:50'],
            'user_confirmed' => ['nullable', 'boolean'],
            'preview_only' => ['nullable', 'boolean'],
        ]);

        $response = $this->taskExecutor->executeStructuredTask(
            $request->user(),
            $validated,
            $this->retriever->getProductVersion()
        );

        return response()->json($response);
    }
}

