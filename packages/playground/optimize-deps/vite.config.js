const vue = require('@vitejs/plugin-vue')

/**
 * @type {import('vite').UserConfig}
 */
module.exports = {
  resolve: {
    dedupe: ['react']
  },

  optimizeDeps: {
    include: ['dep-linked-include'],
    plugins: [vue()]
  },

  build: {
    // to make tests faster
    minify: false
  },

  plugins: [
    vue(),
    // for axios request test
    {
      name: 'mock',
      configureServer({ middlewares }) {
        middlewares.use('/ping', (_, res) => {
          res.statusCode = 200
          res.end('pong')
        })
      }
    }
  ]
}
