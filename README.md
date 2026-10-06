# VEXORA

Game sandbox 2D (pecah blok → kumpulkan bibit → tanam → panen → jual). Berjalan sepenuhnya di browser, jadi bisa dihosting di GitHub Pages.

## Main sekarang

```bash
npm start        # lalu buka http://localhost:8080
npm test         # tes logika game
```

Kontrol: `A/D` jalan · `W`/`Spasi` lompat · klik: pukul / pasang blok / tanam · `1-9` pilih item · `B` toko.

## Deploy ke GitHub Pages

1. Repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Merge ke `main`. Workflow `.github/workflows/pages.yml` menjalankan tes lalu deploy.
3. Alamat: `https://<username>.github.io/vexora/`.

## Struktur

| File | Tugas |
|---|---|
| `src/items.js` | Semua item dan angka penyeimbang (satu sumber kebenaran) |
| `src/world.js` | Pembuatan dunia dari seed |
| `src/game.js` | **Semua aturan game** sebagai aksi: `punch`, `place`, `plant`, `sell`, `buy` |
| `src/physics.js` | Gerak dan tabrakan pemain |
| `src/save.js` | Simpan/muat (adapter, bisa diganti server) |
| `src/render.js`, `src/main.js` | Tampilan, input, UI |
| `tests/` | Tes otomatis |

Aturan kerja: UI tidak boleh mengubah state langsung, hanya lewat aksi di `game.js`. Itu yang membuat game bisa dipindah ke server nanti tanpa ditulis ulang.

## Batasan saat ini (jujur)

- Satu pemain, data hanya di `localStorage` browser. Bisa diedit lewat DevTools, jadi belum ada anti-cheat.
- Multiplayer, akun, dan ekonomi antar-pemain butuh backend. Itu fase berikutnya, setelah game ini terbukti menyenangkan.
- Seni sementara (bentuk sederhana digambar lewat kode, tanpa aset pihak lain).

Versi lama (Express + Turso + Vercel) masih ada di riwayat git branch `main`.
