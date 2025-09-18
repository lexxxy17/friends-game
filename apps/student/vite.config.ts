import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: true, allowedHosts: ['4320101aa8f0b5868998441bc7f2c89d.serveo.net'] }
})
