import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        results: resolve(__dirname, 'results.html'),
        admin: resolve(__dirname, 'admin/index.html'),
        adminDashboard: resolve(__dirname, 'admin/admin_dashboard.html'),
        notFound: resolve(__dirname, '404.html')
      }
    }
  }
});
