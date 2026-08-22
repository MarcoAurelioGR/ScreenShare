import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0', // Libera o Vite para a rede local e externa
    allowedHosts: true
  }
});