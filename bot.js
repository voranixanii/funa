require('dotenv').config();
const tmi = require('tmi.js');
const fs = require('fs');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

// ===== CONFIG =====
const CHANNEL = 'aniiseong';
const PORT = process.env.PORT || 3000;

// ===== FUNA DATA =====
let funas = {};
let lastFuna = {}; // anti spam

if (fs.existsSync('funas.json')) {
  funas = JSON.parse(fs.readFileSync('funas.json'));
}

// ===== EXPRESS =====
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

server.listen(PORT, () => {
  console.log(`Overlay listo en puerto ${PORT}`);
});

// ===== HELPERS =====
function getTitulo(nivel) {
  if (nivel >= 20) return '💀 ELIMINADO';
  if (nivel >= 15) return '🚨 PELIGRO PÚBLICO';
  if (nivel >= 10) return '🔥 FUNADO';
  if (nivel >= 5) return '🤨 SOSPECHOSO';
  return '😇 INOCENTE';
}

function sanitize(text) {
  return text.replace(/[^a-zA-Z0-9_]/g, '');
}

// ===== ROLES =====
const ROLES = {
  VIEWER: 0,
  VIP: 1,
  SUB: 2,
  MOD: 3,
  BROADCASTER: 4
};

function getUserRole(tags) {
  if (tags.badges?.broadcaster) return ROLES.BROADCASTER;
  if (tags.mod) return ROLES.MOD;
  if (tags.badges?.vip) return ROLES.VIP;
  if (tags.subscriber) return ROLES.SUB;
  return ROLES.VIEWER;
}

function requireRole(userRole, minRole) {
  return userRole >= minRole;
}

async function getTwitchAvatar(username) {
  try {
    const res = await fetch(`https://decapi.me/twitch/avatar/${username}`);
    return await res.text();
  } catch {
    return null;
  }
}

// ===== BOT =====
const client = new tmi.Client({
  options: { debug: true },
  connection: { reconnect: true, secure: true },
  identity: {
    username: 'aniiseong',
    password: process.env.TWITCH_TOKEN
  },
  channels: [CHANNEL]
});

client.connect();

// ===== MESSAGE HANDLER =====
client.on('message', async (channel, tags, message, self) => {
  if (self) return;

  const args = message.trim().split(' ');
  const command = args[0].toLowerCase();
  const role = getUserRole(tags);

  // =========================
  // 🔥 FUNA (todos)
  // =========================
  if (command === '!funa') {

    if (!requireRole(role, ROLES.VIEWER)) return;

    let target = sanitize(args[1]?.replace('@', ''));
    const motivo = args.slice(2).join(' ') || 'sin motivo 🤨';

    if (!target) return;

    // anti spam
    if (lastFuna[target] && Date.now() - lastFuna[target] < 3000) return;
    lastFuna[target] = Date.now();

    if (!funas[target]) funas[target] = 0;
    funas[target]++;

    fs.writeFileSync('funas.json', JSON.stringify(funas, null, 2));

    const nivel = funas[target];

    client.say(channel, `🚨 ${target} fue funado por: ${motivo} (x${nivel})`);

    io.emit('nuevaFuna', {
      user: target,
      motivo,
      total: nivel
    });

    if ([5, 10, 15, 20].includes(nivel)) {
      client.say(channel, `⚠️ ${target} alcanzó nivel ${nivel} ${getTitulo(nivel)}`);
      io.emit('alertaFuna', { user: target, nivel });
    }
  }

  // =========================
  // 📊 NIVEL
  // =========================
  if (command === '!nivel') {

    let target = sanitize(args[1]?.replace('@', ''));
    if (!target) return;

    const nivel = funas[target] || 0;

    client.say(channel, `📊 ${target}: ${nivel} funas | ${getTitulo(nivel)}`);
  }

  // =========================
  // 🛡 DEFENDER (SUB+)
  // =========================
  if (command === '!defender') {

    if (!requireRole(role, ROLES.SUB)) {
      client.say(channel, `❌ No tienes permisos para defender`);
      return;
    }

    let target = sanitize(args[1]?.replace('@', ''));
    if (!target || !funas[target]) return;

    funas[target] = Math.max(0, funas[target] - 1);

    fs.writeFileSync('funas.json', JSON.stringify(funas, null, 2));

    client.say(channel, `🛡️ ${target} fue defendido (x${funas[target]})`);

    io.emit('nuevaFuna', {
      user: target,
      motivo: 'defendido 🛡️',
      total: funas[target]
    });
  }

  // =========================
  // 🙏 PERDON (MOD+)
  // =========================
  if (command === '!perdon') {

    if (!requireRole(role, ROLES.MOD)) {
      client.say(channel, `❌ No tienes permisos`);
      return;
    }

    let target = sanitize(args[1]?.replace('@', ''));
    if (!target) return;

    funas[target] = 0;

    fs.writeFileSync('funas.json', JSON.stringify(funas, null, 2));

    io.emit('resetUser', { user: target });

    client.say(channel, `🙏 ${target} fue perdonado`);
  }

  // =========================
  // 🧹 RESET (STREAMER)
  // =========================
  if (command === '!resetfunas') {

    if (!requireRole(role, ROLES.BROADCASTER)) {
      client.say(channel, `❌ Solo el streamer puede usar esto`);
      return;
    }

    funas = {};
    fs.writeFileSync('funas.json', JSON.stringify(funas, null, 2));

    io.emit('resetFunas');
    client.say(channel, '🧹 Funas reiniciadas');
  }

  // =========================
  // 📢 PROMO
  // =========================
  if (command === '!promo') {

    let target = sanitize(args[1]?.replace('@', ''));
    if (!target) return;

    const avatar = await getTwitchAvatar(target);

    io.emit('promo', {
      user: target,
      avatar,
      raid: false
    });

    client.say(channel, `📢 Sigue a https://twitch.tv/${target}`);
  }

  // =========================
  // 📜 HELP
  // =========================
  if (command === '!comandos' || command === '!help') {

    const texto = `
📜 COMANDOS:

🔥 FUNA
!funa @user motivo
!nivel @user

🛡 MODERACIÓN
!defender @user (SUB+)
!perdon @user (MOD+)
!resetfunas (STREAMER)

📢 SOCIAL
!promo @user

🏆 INFO
!help / !comandos
    `.trim();

    client.say(channel, texto);
  }
});

// ===== RAID =====
client.on('raided', async (channel, username, viewers) => {

  const avatar = await getTwitchAvatar(username);

  io.emit('promo', {
    user: username,
    avatar,
    raid: true,
    viewers
  });

  client.say(channel, `🔥 RAID de ${username} con ${viewers} viewers`);
});