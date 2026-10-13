import { readFileSync } from 'fs';

import { defineConfig } from 'vite';
import vibe from '@ape-egg/vite-plugin-vibe';

// Dev serves the pages tree straight from source; `vibe compile` turns the
// same tree into the SPA shell the deploy serves. The templates the guide
// shows are the npm package's own, the one source both ship from.
export default defineConfig({
  server: { allowedHosts: ['.localhost'] },
  optimizeDeps: { exclude: ['@ape-egg/vibe'] },
  plugins: [
    vibe(),
    {
      name: 'underlens-routes',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const path = req.url.split('?')[0];
          if (path.startsWith('/templates/')) return res.end(readFileSync(`package${path}`));
          if (path === '/') req.url = '/pages/index.html';
          next();
        });
      },
    },
  ],
});
