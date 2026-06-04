# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Publish gratis ke public

Proyek ini sudah disiapkan untuk GitHub Pages.

1. Buat repository GitHub baru untuk proyek ini.
2. Tambahkan remote lalu push ke branch `main`.
3. Aktifkan GitHub Pages dengan source dari GitHub Actions.
4. Setiap push ke `main` akan build dan deploy otomatis.

Untuk deploy manual dari mesin lokal:

```bash
npm run deploy
```

Catatan: situs baru benar-benar public setelah repository terhubung ke GitHub.

## Opsi kedua: Vercel

Kalau ingin publish lewat Vercel, langkahnya:

1. Login ke Vercel dan pilih `Add New Project`.
2. Hubungkan repository GitHub proyek ini.
3. Biarkan Vercel mendeteksi `Vite`, atau pakai konfigurasi di [vercel.json](vercel.json).
4. Klik deploy, lalu Vercel akan memberi URL public gratis.

Karena ini app statis, tidak perlu backend untuk tampil online.
