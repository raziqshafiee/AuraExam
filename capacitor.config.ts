import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.auraexam.app',
  appName: 'Aura Exam',
  webDir: 'dist',
  server: {
    // Development: your PC's local IP + dev server port (run `ipconfig` to find IP)
    // Production: replace with deployed URL e.g. https://aura-exam.vercel.app
    url: 'http://10.0.2.2:8080',
    cleartext: true
  }
};

export default config;
