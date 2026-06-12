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

// 🚀 终极雷达：全盘广度优先扫描，彻底击穿 pnpm 任何复杂的虚拟嵌套池，寻找依赖包的绝对路径
function getPackageAbsoluteEntry(packageName: string): string {
  const rootNodeModules = resolve(__dirname, 'node_modules');
  
  // 1. 优先检查根 node_modules 目录
  const directPath = join(rootNodeModules, packageName);
  if (fs.existsSync(directPath) && !fs.lstatSync(directPath).isSymbolicLink()) {
    const entry = findEntryInDir(directPath, packageName);
    if (entry) return entry;
  }

  // 2. 广度优先穿透扫描 .pnpm 虚拟依赖黑盒
  const queue: string[] = [rootNodeModules];
  let visitedCount = 0;
  
  while (queue.length > 0 && visitedCount < 1000) {
    visitedCount++;
    const currentDir = queue.shift()!;
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);
        if (entry.isDirectory()) {
          // 如果找到了目标包名，并且该目录下含有 package.json，说明定位成功
          if (entry.name === packageName && fs.existsSync(join(fullPath, 'package.json'))) {
            const fileEntry = findEntryInDir(fullPath, packageName);
            if (fileEntry) return fileEntry;
          }
          // 仅对特定高密度依赖池进行深挖，保证扫描性能
          if (entry.name === '.pnpm' || entry.name.startsWith('@') || currentDir.endsWith('.pnpm') || currentDir.includes('.pnpm/')) {
            queue.push(fullPath);
          }
        }
      }
    } catch (e) {}
  }
  return packageName;
}

// 🚀 入口分析核心：在给定的物理目录里提取最合规的执行脚本
function findEntryInDir(dirPath: string, packageName: string): string | null {
  try {
    const pkgJsonPath = join(dirPath, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
      const fields = [pkg.browser, pkg.module, pkg.main, pkg.exports?.['.']?.browser, pkg.exports?.['.']?.import, pkg.exports?.['.']?.default];
      for (const field of fields) {
        if (typeof field === 'string') {
          const cleanField = field.replace(/^\.\//, '');
          const exactPath = join(dirPath, cleanField);
          if (fs.existsSync(exactPath) && fs.statSync(exactPath).isFile()) return exactPath;
          // 智能追加缺失的后缀名进行验证
          for (const ext of ['.js', '.mjs', '.ts', '.tsx', '/index.js', '/index.ts']) {
            if (fs.existsSync(exactPath + ext)) return exactPath + ext;
          }
        }
      }
    }
    // 物理兜底机制：广度优先扫描该包的所有目录，抓取第一个合法的代码文件（排除类型文件 .d.ts）
    const scanQueue = [dirPath];
    while (scanQueue.length > 0) {
      const curr = scanQueue.shift()!;
      const files = fs.readdirSync(curr, { withFileTypes: true });
      for (const f of files) {
        const full = join(curr, f.name);
        if (f.isFile() && (f.name.endsWith('.js') || f.name.endsWith('.mjs') || f.name.endsWith('.ts')) && !f.name.endsWith('.d.ts')) {
          return full;
        }
      }
      for (const f of files) {
        const full = join(curr, f.name);
        if (f.isDirectory() && !['node_modules', 'test', 'spec'].includes(f.name)) {
          scanQueue.push(full);
        }
      }
    }
  } catch (e) {}
  return null;
}

const baseUrl = process.env.BASE_URL || '/';
const VITE_AVAILABLE_LOCALES = process.env.VITE_AVAILABLE_LOCALES;

let includeLocales = [resolve(__dirname, 'locales/en.yml')];
if (!process.env.VITEST) {
  if (!VITE_AVAILABLE_LOCALES || VITE_AVAILABLE_LOCALES === '*' || VITE_AVAILABLE_LOCALES === 'all') {
    includeLocales = [resolve(__dirname, 'src/tools/*/locales/**'), resolve(__dirname, 'locales/**')];
  } else {
    const fileNameMatching = VITE_AVAILABLE_LOCALES.includes(',') ? `{${VITE_AVAILABLE_LOCALES}}` : VITE_AVAILABLE_LOCALES;
    includeLocales = [resolve(__dirname, `src/tools/*/locales/${fileNameMatching}.*`), resolve(__dirname, `locales/${fileNameMatching}.*`)];
  }
}

// 🚀 核心雷达进行物理锁定
const resolvedImageInBrowser = getPackageAbsoluteEntry('image-in-browser');
const resolvedFanger = getPackageAbsoluteEntry('fanger');
console.log(`[探针日志] image-in-browser 精准定位至: ${resolvedImageInBrowser}`);
console.log(`[探针日志] fanger 精准定位至: ${resolvedFanger}`);

const baseAliases: Record<string, string> = {
  '@': fileURLToPath(new URL('./src', import.meta.url)),
  'node:fs/promises': fileURLToPath(new URL('./src/_empty.ts', import.meta.url)),
  'node:fs': fileURLToPath(new URL('./src/_empty.ts', import.meta.url)),
  'fs': fileURLToPath(new URL('./src/_empty.ts', import.meta.url)),
  '@babel/core': fileURLToPath(new URL('./src/_empty.ts', import.meta.url)),
  'isolated-vm': fileURLToPath(new URL('./src/_empty.ts', import.meta.url)),
  'onnxruntime-node': fileURLToPath(new URL('./src/_empty.ts', import.meta.url)),
  'unpdf/pdfjs': fileURLToPath(new URL('./src/_empty.ts', import.meta.url)),
  'webcrypto-liner-shim': !process.env.VERCEL ? 'webcrypto-liner-shim' : fileURLToPath(new URL('./src/_empty.ts', import.meta.url)),
};

// 确保只有获取到绝对路径时才注入别名映射，绝对避免死循环
if (resolvedImageInBrowser && resolvedImageInBrowser !== 'image-in-browser') {
  baseAliases['image-in-browser'] = resolvedImageInBrowser;
}
if (resolvedFanger && resolvedFanger !== 'fanger') {
  baseAliases['fanger'] = resolvedFanger;
}

export default defineConfig({
  plugins: [
    VueI18n({ runtimeOnly: true, compositionOnly: true, fullInstall: true, include: includeLocales, strictMessage: false, escapeHtml: true }),
    AutoImport({
      imports: ['vue', 'vue-router', '@vueuse/core', 'vue-i18n', { 'naive-ui': ['useDialog', 'useMessage', 'useNotification', 'useLoadingBar'] }],
      vueTemplate: true, eslintrc: { enabled: true }
    }),
    Icons({ compiler: 'vue3' }),
    vue({ include: [/\.vue$/, /\.md$/] }),
    vueJsx(), markdown(), svgLoader(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: { globPatterns: (process.env.VITE_VERCEL_DEPLOY ? ['**\/*.{css,html}'] : ['**\/*.{js,wasm,css,html}']), maximumFileSizeToCacheInBytes: 25 * 1024 ** 2 },
      strategies: 'generateSW',
      manifest: {
        name: 'IT Tools', description: 'Aggregated set of useful tools for developers.', display: 'standalone',
        start_url: `${baseUrl}?utm_source=pwa&utm_medium=pwa`, scope: baseUrl, orientation: 'any', theme_color: '#18a058', background_color: '#f1f5f9',
        icons: [
          { src: `${baseUrl}favicon-16x16.png`, type: 'image/png', sizes: '16x16' },
          { src: `${baseUrl}favicon-32x32.png`, type: 'image/png', sizes: '32x32' },
          { src: `${baseUrl}android-chrome-192x192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${baseUrl}android-chrome-512x512.png`, sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      }
    }),
    Components({ dirs: ['src/'], extensions: ['vue', 'md'], include: [/\.vue$/, /\.vue\?vue/, /\.md$/], resolvers: [NaiveUiResolver(), IconsResolver({ prefix: 'icon' })] }),
    Unocss(), nodePolyfills(), wasm(), splashScreen({ logoSrc: 'logo.svg', splashBg: '#383838' })
  ],
  base: baseUrl,
  resolve: {
    alias: baseAliases
  },
  define: { 'import.meta.env.PACKAGE_VERSION': JSON.stringify(process.env.npm_package_version) },
  test: { exclude: [...configDefaults.exclude, '**/*.e2e.spec.ts'], server: { deps: { inline: ['otpauth-migration', 'proto'] } } },
  build: {
    target: 'esnext', sourcemap: false, minify: 'esbuild', reportCompressedSize: false,
    rollupOptions: { external: ['regex', './out/isolated_vm', 'isolated-vm', 'onnxruntime-node', 'unpdf/pdfjs'], output: { format: 'es' }, cache: false, maxParallelFileOps: 1 }
  },
  optimizeDeps: {
    include: ['isolated-vm', 'pdfjs-dist', 'onnxruntime-node', 'onnxruntime-web', 'unpdf', 'unpdf/pdfjs', ...(process.env.VERCEL ? ['webcrypto-liner-shim'] : [])],
    esbuildOptions: { supported: { 'top-level-await': true } }
  }
});
