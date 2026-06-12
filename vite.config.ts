import { URL, fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import fs from 'node:fs'; 
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import wasm from 'vite-plugin-wasm';
import { splashScreen } from 'vite-plugin-splash-screen';

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue'; 
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

// 🚀 终极贪婪型依赖入口探测器：全面支持 exports 对象、browser 字典、及物理全盘扫描
function getPackageActualEntry(packageName: string) {
  const packageDir = resolve(__dirname, 'node_modules', packageName);
  if (!fs.existsSync(packageDir)) return packageName;

  try {
    const pkgJsonPath = join(packageDir, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
      
      // 1. 深度剖析条件高级 exports 条件分支
      if (pkg.exports) {
        const exp = pkg.exports['.'] || pkg.exports;
        if (exp && typeof exp === 'object') {
          const val = exp.browser || exp.import || exp.module || exp.default;
          if (typeof val === 'string' && fs.existsSync(join(packageDir, val))) return join(packageDir, val);
        }
      }
      
      // 2. 解构 browser 字段（支持字符串与条件替换映射表对象）
      if (pkg.browser) {
        if (typeof pkg.browser === 'string' && fs.existsSync(join(packageDir, pkg.browser))) {
          return join(packageDir, pkg.browser);
        }
        if (typeof pkg.browser === 'object') {
          for (const key in pkg.browser) {
            const val = pkg.browser[key];
            if (typeof val === 'string' && fs.existsSync(join(packageDir, val))) return join(packageDir, val);
          }
        }
      }

      // 3. 基础 module / main 退路校验
      if (typeof pkg.module === 'string' && fs.existsSync(join(packageDir, pkg.module))) return join(packageDir, pkg.module);
      if (typeof pkg.main === 'string' && fs.existsSync(join(packageDir, pkg.main))) return join(packageDir, pkg.main);
    }
  } catch (e) {
    // 忽略异常结构
  }

  // 4. 🚀 降维打击：如果上述元数据全部作妖，直接物理扫描磁盘上真实存在的编译成品
  const targetDirs = [join(packageDir, 'dist'), join(packageDir, 'lib'), packageDir];
  for (const dir of targetDirs) {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      const bestMatch = files.find(f => ['index.js', 'index.mjs', 'main.js', 'index.browser.js'].includes(f)) 
                     || files.find(f => f.endsWith('.js') || f.endsWith('.mjs'));
      if (bestMatch) return join(dir, bestMatch);
    }
  }

  return packageName;
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
      
      // 🚀 强制锁定物理绝对路径，彻底根治 PWA 工作流中所有潜在的路径迷路问题
      'image-in-browser': getPackageActualEntry('image-in-browser'),
      'fanger': getPackageActualEntry('fanger'),
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
