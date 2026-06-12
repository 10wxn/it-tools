import { URL, fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import fs from 'node:fs'; 
import { createRequire } from 'node:module'; 
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

const require = createRequire(import.meta.url);

// 辅助工具：智能验证并补齐后缀
function findExistingFileWithExt(basePath: string) {
  if (fs.existsSync(basePath) && fs.statSync(basePath).isFile()) return basePath;
  const extensions = ['.js', '.mjs', '.cjs', '/index.js', '/index.mjs'];
  for (const ext of extensions) {
    if (fs.existsSync(basePath + ext)) return basePath + ext;
  }
  return null;
}

// 🚀 三轨贪婪型依赖入口探测器（Node22 ESM 官方算法 + pnpm 深度黑盒盲搜）
function getPackageActualEntry(packageName: string) {
  // 第一轨：利用 Node 22 原生 ESM 模块流解析（降维打击现代 ESM-Only 依赖包）
  try {
    const resolvedUrl = import.meta.resolve(packageName);
    if (resolvedUrl) {
      const resolvedPath = fileURLToPath(resolvedUrl);
      if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
        return resolvedPath;
      }
    }
  } catch (e) {}

  // 第二轨：传统 CommonJS 核心层解析
  try {
    const nativePath = require.resolve(packageName);
    if (nativePath && fs.existsSync(nativePath)) return nativePath;
  } catch (e) {}

  // 第三轨：深度穿透 pnpm 虚拟依赖黑盒进行全盘物理扫描
  const rootNodeModules = resolve(__dirname, 'node_modules');
  let packageDir = join(rootNodeModules, packageName);
  
  // 如果根目录符号链接断裂，深入 .pnpm 依赖池盲搜
  if (!fs.existsSync(packageDir)) {
    const pnpmDir = join(rootNodeModules, '.pnpm');
    if (fs.existsSync(pnpmDir)) {
      try {
        const dirs = fs.readdirSync(pnpmDir);
        for (const d of dirs) {
          const candidate = join(pnpmDir, d, 'node_modules', packageName);
          if (fs.existsSync(candidate)) {
            packageDir = candidate;
            break;
          }
        }
      } catch (e) {}
    }
  }

  if (!fs.existsSync(packageDir)) return packageName;

  const checkAndReturn = (relativePath: string) => {
    return findExistingFileWithExt(join(packageDir, relativePath));
  };

  try {
    const pkgJsonPath = join(packageDir, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
      
      if (pkg.exports) {
        if (typeof pkg.exports === 'string') { const res = checkAndReturn(pkg.exports); if (res) return res; }
        const exp = pkg.exports['.'] || pkg.exports;
        if (exp) {
          if (typeof exp === 'string') { const res = checkAndReturn(exp); if (res) return res; }
          else if (typeof exp === 'object') {
            const val = exp.browser || exp.import || exp.module || exp.default;
            if (typeof val === 'string') { const res = checkAndReturn(val); if (res) return res; }
          }
        }
      }
      if (pkg.browser) {
        if (typeof pkg.browser === 'string') { const res = checkAndReturn(pkg.browser); if (res) return res; }
        if (typeof pkg.browser === 'object') {
          for (const key in pkg.browser) {
            const val = pkg.browser[key];
            if (typeof val === 'string') { const res = checkAndReturn(val); if (res) return res; }
          }
        }
      }
      if (typeof pkg.module === 'string') { const res = checkAndReturn(pkg.module); if (res) return res; }
      if (typeof pkg.main === 'string') { const res = checkAndReturn(pkg.main); if (res) return res; }
    }
  } catch (e) {}

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

// 🚀 双轨全面锁定物理绝对文件路径
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
      
      // 🚀 给 PWA (Workbox) 喂入无懈可击的物理绝对路径
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
