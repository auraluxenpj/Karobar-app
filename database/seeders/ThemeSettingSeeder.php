<?php

namespace Database\Seeders;

use App\Models\ThemeSetting;
use Illuminate\Database\Seeder;

class ThemeSettingSeeder extends Seeder
{
    /**
     * Run the database seeders.
     */
    public function run(): void
    {
        // Create default theme if none exists
        if (ThemeSetting::count() === 0) {
            ThemeSetting::create([
                'name' => 'Default Theme',
                'primary_color' => '#3b82f6',
                'primary_hover' => '#2563eb',
                'primary_light' => '#dbeafe',
                'secondary_color' => '#8b5cf6',
                'secondary_hover' => '#7c3aed',
                'secondary_light' => '#ede9fe',
                'tertiary_color' => '#06b6d4',
                'tertiary_hover' => '#0891b2',
                'tertiary_light' => '#cffafe',
                'background_color' => '#f8fafc',
                'surface_color' => '#ffffff',
                'text_primary' => '#1e293b',
                'text_secondary' => '#64748b',
                'success_color' => '#10b981',
                'warning_color' => '#f59e0b',
                'danger_color' => '#ef4444',
                'border_color' => '#e2e8f0',
                'shadow_color' => '#1e293b',
                'is_active' => true,
            ]);

            $this->command?->info('Default theme created successfully.');
        }
    }
}

