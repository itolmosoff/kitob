# kitob.uz — kitob ijarasi
Hech narsa o'rnatish shart emas (npm install YO'Q). Faqat Node 22.13+ kerak.

    npm run dev        # yoki: node server/index.js
    http://localhost:3001

## MUHIM: ma'lumotlar qayerda?
Baza kod papkasidan tashqarida saqlanadi: `C:\Users\<ism>\.kitob-uz\kitob.db` (Windows).
Shuning uchun yangi zip/papka ochsangiz ham akkauntlar va kitoblar YO'QOLMAYDI. Bazani o'chirmang.
Boshqa joyga saqlash: `$env:DATA_DIR="D:\kitob-data"; npm run dev`

## Hamma ko'rishi uchun
- Bir Wi-Fi: `http://<kompyuter-IP>:3001`
- Internet: `npx cloudflared tunnel --url http://localhost:3001`
Port band bo'lsa: `$env:PORT=3002; npm run dev`

`src/` — client manba kodi (ishga tushirish uchun kerak emas, tayyor `server/public/app.js` ishlaydi).
