import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'
export default defineConfig({
 resolve:{alias:[{find:'react/jsx-dev-runtime',replacement:resolve(__dirname,'../../node_modules/react/jsx-dev-runtime.js')},{find:/^react$/,replacement:resolve(__dirname,'../../node_modules/react')},{find:'react/jsx-runtime',replacement:resolve(__dirname,'../../node_modules/react/jsx-runtime.js')}]},
 test:{include:['apps/mini/tests/**/*.test.tsx']}
})
