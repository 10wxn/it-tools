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

// 🚀 辅助函数：智能探测并补齐缺失的后缀名（如将 ./main 补齐为 ./main.js）
function findExistingFileWithExt(basePath: string) {
  if (fs.existsSync(basePath) && fs.statSync(basePath).isFile()) return basePath;
  const extensions = ['.js', '.mjs', '.cjs', '/index.js', '/index.mjs'];
  for (const ext of extensions) {
    if (fs.existsSync(basePath + ext)) return basePath + ext;
  }
  return null;
}

// 🚀 终极贪婪型路径探针
function getPackageActualEntry(packageName: string) {
  const packageDir = resolve(__dirname, 'node_modules', packageName);
  if (!fs.existsSync(packageDir)) return packageName;

  const checkAndReturn = (relativePath: string) => {
    return findExistingFileWithExt(join(packageDir, relativePath));
  };

  try {
    const pkgJsonPath = join(packageDir, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
      
      // 1. 解析 exports 字段
      if (pkg.exports) {
        if (typeof pkg.exports === 'string') {
          const res = checkAndReturn(pkg.exports);
          if (res) return res;
        }
        const exp = pkg.exports['.'] || pkg.exports;
        if (exp) {
          if (typeof exp === 'string') {
            const res = checkAndReturn(exp);
            if (res) return res;
          } else if (typeof exp === 'object') {
            const val = exp.browser || exp.import || exp.module || exp.default;
            if (typeof val === 'string') {
              const res = checkAndReturn(val);
              if (res) return res;
            }
          }
        }
      }
      
      // 2. 解析 browser 字段
      if (pkg.browser) {
        if (typeof pkg.browser === 'string') {
          const res = checkAndReturn(pkg.browser);
          if (res) return res;
        }
        if (typeof pkg.browser === 'object') {
          for (const key in pkg.browser) {
            const val = pkg.browser[key];
            if (typeof val === 'string') {
              const res = checkAndReturn(val);
              if (res) return res;
            }
          }
        }
      }

      // 3. 解析传统 module / main 字段
      if (typeof pkg.module === 'string') {
        const res = checkAndReturn(pkg.module);
        if (res) return res;
      }
      if (typeof pkg.main === 'string') {
        const res = checkAndReturn(pkg.main);
        if (res) return res;
      }
    }
  } catch (e) {
    // 静默容错
  }

  // 4. 🚀 强力底线：如果配置元数据全部失效，直接物理扫描磁盘上真实存在的文件
  const targetDirs = [join(packageDir, 'dist'), join(packageDir, 'lib'), join(packageDir, 'build'), join(packageDir, 'src'), packageDir];
  for (const dir of targetDirs) {
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      const files = fs.readdirSync(dir);
      const bestMatch = files.find(f => ['index.js', 'index.mjs', 'main.js', 'index.browser.js', `${packageName}.js`, `${packageName}.mjs`].includes(f)) 
                     || files.find(f => f.endsWith('.js') || f.endsWith('.mjs') || f.endsWith('.cjs'));
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

// 🚀 打印动态探测结果，方便在 GitHub Actions 日志中直观排查
const resolvedImageInBrowser = getPackageActualEntry('image-in-browser');
const resolvedFanger = getPackageActualEntry('fanger');
console.log(`[探针日志] image-in-browser 精准定位至: ${resolvedImageInBrowser}`);
console.log(`[探针日志] fanger 精准定位至: ${resolvedFanger}`);

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
      
      // 🚀 终极锁定的绝对路径物理映射
      'image-in-browser': resolvedImageInBrowser,
      'fanger': resolvedFanger,
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
