<?php

namespace App\Providers;

use Illuminate\Foundation\Support\Providers\AuthServiceProvider as ServiceProvider;
use Illuminate\Support\Facades\Gate;

class AuthServiceProvider extends ServiceProvider
{
    /**
     * The model to policy mappings for the application.
     *
     * @var array<class-string, class-string>
     */
    protected $policies = [
        \App\Models\BackupLog::class => \App\Policies\BackupPolicy::class,
        \App\Models\StocktakeSession::class => \App\Policies\StocktakePolicy::class,
        \App\Authorizables\CostOfSaleReport::class => \App\Policies\CostOfSaleReportPolicy::class,
        \App\Authorizables\CurrentStockReport::class => \App\Policies\CurrentStockReportPolicy::class,
        \App\Authorizables\NearExpiryProductReport::class => \App\Policies\NearExpiryProductReportPolicy::class,
        \App\Authorizables\ProductComprehensiveReport::class => \App\Policies\ProductComprehensiveReportPolicy::class,
        \App\Authorizables\PurchaseDetailReport::class => \App\Policies\PurchaseDetailReportPolicy::class,
        \App\Authorizables\PurchaseOrderForecast::class => \App\Policies\PurchaseOrderForecastPolicy::class,
        \App\Authorizables\SaleDetailReport::class => \App\Policies\SaleDetailReportPolicy::class,
        \App\Authorizables\StockAdjustmentReport::class => \App\Policies\StockAdjustmentReportPolicy::class,
    ];

    /**
     * Register any authentication / authorization services.
     */
    public function boot(): void
    {
        $this->registerPolicies();

        // This makes Admin have all permissions automatically
        Gate::before(function ($user, $ability) {
            return $user->hasRole('Admin') ? true : null;
        });

        // Tie manage-users Gate strictly to Admin role or explicit user.manage permission
        Gate::define('manage-users', function ($user) {
            if (method_exists($user, 'hasRole') && $user->hasRole('Admin')) {
                return true;
            }
            if (method_exists($user, 'can') && $user->can('user.manage')) {
                return true;
            }
            return false;
        });
    }
}
