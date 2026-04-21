require('dotenv').config();
const tmi = require('tmi.js');
const fs = require('fs');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

// ===== CONFIG =====
const CHANNEL = 'aniiseong'; // tu canal real
const PORT = 3000;

// ==================

let funas = {};

// cargar archivo si existe
if (fs.existsSync('funas.json')) {
  funas = JSON.parse(fs.readFileSync('funas.json'));
}

// ===== TWITCH BOT =====
const client = new tmi.Client({
  options: { debug: true },
  connection: {
    reconnect: true,
    secure: true
  },
  identity: {
    username: 'aniiseong', // tu usuario de Twitch
    password: process.env.TWITCH_TOKEN
  },
  channels: [CHANNEL]
});

client.connect();

client.on('message', (channel, tags, message, self) => {
  if (self) return;

  if (message.startsWith('!funa')) {
    const args = message.split(' ');
    const target = args[1];
    const motivo = args.slice(2).join(' ') || 'sin motivo 🤨';

    if (!target) return;

    if (!funas[target]) {
      funas[target] = 0;
    }

    funas[target]++;

    fs.writeFileSync('funas.json', JSON.stringify(funas, null, 2));

    // mensaje en chat
    client.say(channel, `🚨 ${target} fue funado por: ${motivo} (x${funas[target]})`);

    // enviar al overlay
    io.emit('nuevaFuna', {
      user: target,
      motivo: motivo,
      total: funas[target]
    });

    // alerta especial
    if (funas[target] === 5) {
        client.say(channel, `⚠️ ${target} alcanzó NIVEL 5 DE FUNA 💀`);
        io.emit('alertaFuna', { user: target, nivel: 5 });
      }

      if (funas[target] === 10) {
        client.say(channel, `🔥 ${target} está totalmente FUNADO (10)`);
        io.emit('alertaFuna', { user: target, nivel: 10 });
      }

      if (funas[target] === 15) {
        client.say(channel, `🚨 ${target} es una AMENAZA PÚBLICA (15)`);
        io.emit('alertaFuna', { user: target, nivel: 15 });
      }

      if (funas[target] === 20) {
        client.say(channel, `💀💀 ${target} HA SIDO ELIMINADO DEL CHAT (20)`);
        io.emit('alertaFuna', { user: target, nivel: 20 });
    }
  }
  if (message === '!resetfunas') {
  // verificar permisos (mod o streamer)
  if (tags.mod || tags.badges?.broadcaster) {
    funas = {};
    fs.writeFileSync('funas.json', JSON.stringify(funas, null, 2));

    client.say(channel, '🧹 Funas reiniciadas');
    io.emit('resetFunas'); // opcional para overlay
  } else {
    client.say(channel, `❌ ${tags.username}, no tienes permisos`);
  }
}

if (message === '!topfunados') {
  const ranking = Object.entries(funas)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  if (ranking.length === 0) {
    client.say(channel, '📊 No hay funas aún');
    return;
  }

  let texto = '🏆 Top funados: ';

  ranking.forEach(([user, count], index) => {
    texto += `${index + 1}. ${user} (${count}) `;
  });

  client.say(channel, texto);
}

});

// ===== SERVIDOR PARA OVERLAY =====
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

server.listen(PORT, () => {
  console.log(`Overlay listo en http://localhost:${PORT}/overlay.html`);
});