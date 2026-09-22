/// <reference types="vite/client" />

// Side-effect CSS imports are handled by Vite, not TypeScript.
declare module '*.css' {
  const content: string
  export default content
}
