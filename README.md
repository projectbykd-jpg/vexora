# VEXORA

Game sandbox 2D bergaya Growtopia: masuk dunia lewat nama, pukul blok, pungut item yang jatuh, tanam pohon, gabung bibit (splice), lalu jual. Berjalan sepenuhnya di browser, jadi bisa dihosting di GitHub Pages.

Semua gambar dan suara dibuat lewat kode (tanpa aset pihak lain).

## Main sekarang

```bash
npm start        # lalu buka http://localhost:8080
npm test         # tes logika game
```

Kontrol: `A/D` jalan · `W`/`Spasi` lompat · klik: pukul / pasang blok / tanam / splice · `1-9` pilih item · `R` buku resep · `B` toko · `M` suara · `E` dekat gerbang atau `Esc`: keluar dunia.

## Cara main

1. Ketik nama dunia (atau pilih yang ada). Nama yang sama selalu menghasilkan dunia yang sama.
2. Pukul blok. Item dan gem **jatuh ke tanah**; jalan melewatinya untuk memungut.
3. Tanam bibit di atas tanah. Pohon tumbuh dengan waktu nyata, lalu pukul pohon matang untuk panen.
4. **Splice:** tanam bibit lain di atas pohon yang masih tumbuh untuk mengubahnya.

| Bibit A | Bibit B | Hasil |
|---|---|---|
| Tanah | Batu | Pasir |
| Tanah | Kayu | Rumput |
| Batu | Kayu | Bata |
| Pasir | Batu | Kaca |

5. Jual hasil panen di Toko untuk gem. Harga beli selalu lebih mahal dari harga jual (ada tes yang menjaganya).

Inventori dan gem dibawa antar dunia. Setiap dunia menyimpan perubahan, pohon, dan item jatuhnya sendiri.

## Deploy ke GitHub Pages

1. Repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Merge ke `main`. Workflow `.github/workflows/pages.yml` menjalankan tes lalu deploy.
3. Alamat: `https://<username>.github.io/vexora/`.

## Struktur

| File | Tugas |
|---|---|
| `src/items.js` | Semua item dan angka penyeimbang (satu sumber kebenaran) |
| `src/world.js` | Pembuatan dunia dari nama/seed, termasuk gua |
| `src/game.js` | **Semua aturan game** sebagai aksi: `punch`, `place`, `plant` (juga splice), `sell`, `buy`, plus fisika item jatuh |
| `src/physics.js` | Gerak dan tabrakan pemain |
| `src/save.js` | Simpan/muat profil + per dunia; data dari penyimpanan tidak pernah dipercaya (disaring) |
| `src/art.js`, `src/fx.js`, `src/audio.js` | Seni, partikel, dan suara buatan kode |
| `src/render.js`, `src/main.js` | Tampilan, input, UI |
| `tests/` | Tes otomatis |

Aturan kerja: UI tidak boleh mengubah state langsung, hanya lewat aksi di `game.js`. Itu yang membuat game bisa dipindah ke server nanti tanpa ditulis ulang.

## Batasan saat ini (jujur)

- Satu pemain, data hanya di `localStorage` browser. Bisa diedit lewat DevTools, jadi belum ada anti-cheat.
- Belum ada multiplayer, akun, kunci dunia, atau perdagangan antar-pemain. Itu butuh backend dan merupakan inti ekonomi Growtopia; fase berikutnya, setelah loop ini terbukti menyenangkan.
- Seni sementara (bentuk sederhana digambar lewat kode, tanpa aset pihak lain).

Versi lama (Express + Turso + Vercel) masih ada di riwayat git branch `main`.
