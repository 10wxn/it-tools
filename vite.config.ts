import { URL, fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import fs from 'node:fs'; // 🚀 引入原生的文件系统模块
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import wasm from 'vite-plugin-wasm';
import { splashScreen } from 'vite-plugin-splash-screen';

import { defineConfig } from 'vite';
import vue = require('@vitejs/plugin-vue');
import vueJsx from '@vitejs/plugin-vue-jsx';
import markdown from 'unplugin-vue-markdown/vite';
import svgLoader from 'vite-svg-loader';
import { VitePWA } from 'vite-plugin-pwa';
import AutoImport from 'unplugin-auto-import/vite';
import Components from 'unplugin-vue-components/vite';
import { NaiveUiResolver } from 'unplugin-vue-components/resolvers';
import Unocss from 'unocss/vite';
import { configDefaults } from 'vitest/config';
import Icons from 'unplugin-icons/vite';
import IconsResolver from 'unplugin-icons/resolver';
import VueI18n from '@intlify/unplugin-vue-i18n/vite';

// 🚀 核心黑魔法：编写一个安全的、不崩溃的依赖入口探测器
function safeResolvePackageEntry(packageName: string) {
  const packageDir = resolve(__dirname, 'node_modules', packageName);
  
  if (!fs.existsSync(packageDir)) {
    return packageName; // 如果 node_modules 还没准备好，安全返回包名本身
  }

  try {
    // 1. 尝试读取 package.json 看有没有更适合前端浏览器的字段 (browser 或 module)
    const pkgJsonPath = join(packageDir, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
      const targetField = pkg.browser || pkg.module || pkg.main;
      if (targetField) {
        const resolved = join(packageDir, targetField);
        if (fs.existsSync(resolved)) return resolved;
      }
    }
  } catch (e) {
    // 忽略解析 JSON 的潜在错误
  }

  // 2. 备用暴破路径搜寻列表（避开已经失效的 lib/index.js 坑）
  const candidates = [
    join(packageDir, 'dist', 'index.js'),
    join(packageDir, 'dist', 'index.mjs'),
    join(packageDir, 'index.js'),
    join(packageDir, 'main.js'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate; // 抓到一个存在的文件就立刻返回绝对路径
    }
  }

  return packageName; // 实在找不到，死马当活马医返回原名
}

const baseUrl = process.env.BASE_URL || '/';

const VITE_AVAILABLE_LOCALES = process.env.VITE_AVAILABLE_LOCALES;
console.log(`Building for locales: ${VITE_AVAILABLE_LOCALES}`);

let includeLocales = [
  resolve(__dirname, 'locales/en.yml'),
];
if (!process.env.VITEST) {
  if (!VITE_AVAILABLE_LOCALES || VITE_AVAILABLE_LOCALES === '*' || VITE_AVAILABLE_LOCALES === 'all') {
    includeLocales = [
      resolve(__dirname, 'src/tools/*/locales/**'),
      resolve(__dirname, 'locales/**'),
    ];
  }
  else {
    const fileNameMatching = VITE_AVAILABLE_LOCALES.includes(',') ? `{${VITE_AVAILABLE_LOCALES}}` : VITE_AVAILABLE_LOCALES;
    includeLocales = [
      resolve(__dirname, `src/tools/*/locales/${fileNameMatching}.*`),
      resolve(__dirname, `locales/${fileNameMatching}.*`),
    ];
  }
}

export default defineConfig({
  plugins: [
    VueI18n({
      runtimeOnly: true,
      compositionOnly: true,
      fullInstall: true,
      include: includeLocales,
      strictMessage: false,
      escapeHtml: true,
    }),
    AutoImport({
      imports: [
        'vue',
        'vue-router',
        '@vueuse/core',
        'vue-i18n',
        {
          'naive-ui': ['useDialog', 'useMessage', 'useNotification', 'useLoadingBar'],
        },
      ],
      vueTemplate: true,
      eslintrc: {
        enabled: true,
      },
    }),
    Icons({ compiler: 'vue3' }),
    vue({
      include: [/\.vue$/, /\.md$/],
    }),
    vueJsx(),
    markdown(),
    svgLoader(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: (process.env.VITE_VERCEL_DEPLOY ? ['**\/*.{css,html}'] : ['**\/*.{js,wasm,css,html}']),
        maximumFileSizeToCacheInBytes: 25 * 1024 ** 2,
      },
      strategies: 'generateSW',
      manifest: {
        name: 'IT Tools',
        description: 'Aggregated set of useful tools for developers.',
        display: 'standalone',
        start_url: `${baseUrl}?utm_source=pwa&utm_medium=pwa`,
        scope: baseUrl,
        orientation: 'any',
        theme_color: '#18a058',
        background_color: '#f1f5f9',
        icons: [
          {
            src: `${baseUrl}favicon-16x16.png`,
            type: 'image/png',
            sizes: '16x16',
          },
          {
            src: `${baseUrl}favicon-32x32.png`,
            type: 'image/png',
            sizes: '32x32',
          },
          {
            src: `${baseUrl}android-chrome-192x192.png`,
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: `${baseUrl}android-chrome-512x512.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
    }),
    Components({
      dirs: ['src/'],
      extensions: ['vue', 'md'],
      include: [/\.vue$/, /\.vue\?vue/, /\.md$/],
      resolvers: [NaiveUiResolver(), IconsResolver({ prefix: 'icon' })],
    }),
    Unocss(),
    nodePolyfills(),
    wasm(),
    splashScreen({
      logoSrc: 'logo.svg',
      splashBg: '#383838',
    }),
  ],
  base: baseUrl,
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'node:fs/promises': fileURLToPath(new URL('./src/_empty.ts', import.meta.url)),
      'node:fs': fileURLToPath(new URL('./src/_empty.ts', import.meta.url)),
      'fs': fileURLToPath(new URL('./src/_empty.ts', import.meta.url)),
      '@babel/core': fileURLToPath(new URL('./src/_empty.ts', import.meta.url)),
      'isolated-vm': fileURLToPath(new URL('./src/_empty.ts', import.meta.url)),
      'onnxruntime-node': fileURLToPath(new URL('./src/_empty.ts', import.meta.url)),
      'unpdf/pdfjs': fileURLToPath(new URL('./src/_empty.ts', import.meta.url)),
      'webcrypto-liner-shim': !process.env.VERCEL ? 'webcrypto-liner-shim' : fileURLToPath(new URL('./src/_empty.ts', import.meta.url)),
      
      // 🚀 应用安全探测别名，再也不怕 package.json 抽风和 Node 22 的强校验
      'image-in-browser': safeResolvePackageEntry('image-in-browser'),
      'fanger': safeResolvePackageEntry('fanger'),
    },
  },
  define: {
    'import.meta.env.PACKAGE_VERSION': JSON.stringify(process.env.npm_package_version),
  },
  test: {
    exclude: [...configDefaults.exclude, '**/*.e2e.spec.ts'],
    server: {
      deps: {
        inline: ['otpauth-migration', 'proto'],
      },
    },
  },
  build: {
    target: 'esnext',
    sourcemap: false,               
    minify: 'esbuild',              
    reportCompressedSize: false,    
    rollupOptions: {
      maxParallelFileOps: 1,        
      external: ['regex', './out/isolated_vm', 'isolated-vm', 'onnxruntime-node', 'unpdf/pdfjs'],
      output: {
        format: 'es',
      },
      cache: false,
    },
  },
  optimizeDeps: {
    include: ['isolated-vm', 'pdfjs-dist', 'onnxruntime-node', 'onnxruntime-web', 'unpdf', 'unpdf/pdfjs', ...(process.env.VERCEL ? ['webcrypto-liner-shim'] : [])],
    esbuildOptions: {
      supported: {
        'top-level-await': true,
      },
    },
  },
});
