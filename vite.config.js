import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import react from '@vitejs/plugin-react';

export default defineConfig({
    server: {
        host: '0.0.0.0',
        cors: {
            origin: '*',
            methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['*'],
        },
        hmr: {
            host: 'localhost',
        },
        watch: {
            ignored: [
                '**/storage/**',
                '**/database/**',
                '**/bootstrap/cache/**',
                '**/vendor/**',
            ],
        },
    },
    plugins: [
        laravel({
            input: ['resources/css/app.css', 'resources/js/app.jsx'],
            refresh: true,
        }),
        react(),
    ],
    build: {
        rolldownOptions: {
            output: {
                codeSplitting: {
                    groups: [
                        {
                            name: 'vendor-react',
                            test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/,
                            priority: 20,
                        },
                        {
                            name: 'vendor',
                            test: /node_modules[\\/](clsx|@floating-ui|prop-types|react-is|hoist-non-react-statics|tiny-invariant)[\\/]/,
                            priority: 18,
                        },
                        {
                            name: 'vendor-charts',
                            test: /node_modules[\\/](recharts|d3-[^\\/]+|victory-vendor)[\\/]/,
                            priority: 15,
                        },
                        {
                            name: 'vendor-filepond',
                            test: /node_modules[\\/](filepond|react-filepond|filepond-plugin-[^\\/]+)[\\/]/,
                            priority: 15,
                        },
                        {
                            name: 'vendor-datepicker',
                            test: /node_modules[\\/](react-datepicker|date-fns)[\\/]/,
                            priority: 15,
                        },
                        {
                            name: 'vendor-select',
                            test: /node_modules[\\/](react-select|@emotion|memoize-one)[\\/]/,
                            priority: 15,
                        },
                        {
                            name: 'vendor',
                            test: /node_modules[\\/]/,
                            priority: 10,
                        },
                    ],
                },
            },
        },
    },
});
