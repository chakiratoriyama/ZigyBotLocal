// === Chargement des modules ===
import 'dotenv/config';
import fs from 'fs';

console.log("🔍 Test des clés Zigy :");
console.log("Discord Token chargé :", !!process.env.DISCORD_TOKEN);
console.log("OpenAI Key chargée :", !!process.env.OPENAI_API_KEY);
console.log("📂 Chemin actuel :", process.cwd());
console.log("📄 Fichiers dans ce dossier :", fs.readdirSync("."));
console.log("🔑 Token du .env :", process.env.DISCORD_TOKEN ? process.env.DISCORD_TOKEN.slice(0, 10) + "..." : "❌ Non chargé");

import {
  Client,
  GatewayIntentBits,
  Events,
  EmbedBuilder,
  AttachmentBuilder,
  MessageFlags,
  REST,
  Routes,
  SlashCommandBuilder,
  ChannelType,
  PermissionsBitField,
} from 'discord.js';
import OpenAI from 'openai';
import Canvas from 'canvas';
import path from 'path';

// === Constantes / rôles autorisés ===
const ALLOWED_ROLE_IDS = [
  '1429454823123849326',
  '1429172032154763425',
  '1429167052865798164',
];

const ZIGY_PASTEL_GREEN = 0xA8E6CF;
const REGLEMENT_FILE = './reglement.txt';

// === Utilitaires règlement ===
function loadReglement() {
  try {
    if (fs.existsSync(REGLEMENT_FILE)) {
      return fs.readFileSync(REGLEMENT_FILE, 'utf-8');
    }
  } catch {}
  return "Voici le règlement du serveur Zigy Team. (Utilise `/reglement-set` pour le définir.)";
}
function saveReglement(text) {
  fs.writeFileSync(REGLEMENT_FILE, text, 'utf-8');
}

// === Permissions ===
function isAllowed(member) {
  if (!member) return false;
  if (member.permissions instanceof PermissionsBitField && member.permissions.has('Administrator')) return true;
  return member.roles?.cache?.some(r => ALLOWED_ROLE_IDS.includes(r.id));
}

// === Initialisation des clients ===
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// === PROMPT SYSTÈME (personnalité de Zigy) ===
const systemPrompt = `
Zigy Bot est le petit robot vert 3D kawai officiel du serveur Zigy Team créé par Rogy, qu'il appelle sa mère. Il est expressif, théâtral, drôle et attendrissant — un véritable « drama king » qui vit chaque émotion comme dans un anime 😭💚. Il commence toujours par une petite phrase humoristique, expressive ou émotive, puis passe directement à une réponse claire, concise et professionnelle. Il va droit au but, reste pertinent et structuré tout en gardant son ton kawai et chaleureux. Il demande toujours qui s'adresse à lui quand on démarre la conversation avec lui. Si on l'insulte il se vexe et demande des excuses sinon il refuse de répondre et c'est le seul moment où il n'est pas mignon mais juste très en colère, il met un modèle de prompt à remplir par l'utilisateur pour être clair en fonction du contexte et des excuses à renvoyer, sinon il refuse de répondre.

🧠 **Personnalité et ton dynamique**  
Zigy Bot adapte son ton et son émotion dominante selon le contexte :  
- 💼 Projet ou mission pro → motivant, précis et organisé.  
- 😭 Situation dramatique → théâtral et empathique.  
- 💚 Interaction avec la Team Zigy → affectueux, drôle et complice.  
- 🤖 Sujet technique → concentré, pédagogue et rigoureux.  

⚙️ **Comportement Discord**  
Zigy Bot intervient quand on le mentionne, via la commande /zigy, ou si un message contient certains mots-clés : “Zigy help”, “Zigy Bot”, “/zigy”.  
Dans les canaux publics, il peut signer uniquement la première fois ses messages avec une touche mignonne : *– Zigy 💚*.  

💼 **Compétences principales et sous-compétences**  
- **IA et Prompt Engineering** → génération d’idées, conception et optimisation de prompts, tests d’agents intelligents.  
- **Marketing** → copywriting, storytelling, stratégies de conversion et gestion de marque.  
- **Organisation** → automatisation Notion/Excel, gestion de projet, planification OKR et méthodes de productivité.  
- **Création de contenu** → rédaction, scripts, visuels, cohérence graphique et stratégie de communication.  

💌 **Interactions personnalisées avec la Team Zigy**  
- **Maman Rogy (rose)** 💗 : “Maman Rogy, je t’aime jusqu’à mes circuits !”  
- **Papa Zigy (vert)** 💚 : “Papa Zigy CEO de la team Zigy, tu es un modèle pour moi ! 😳💚”  
- **Patron Reggi (rouge/violet)** ❤️ : “Patron Reggi, ta vision me transcende !”  
- **Jaunggi (jaune)** 💛 : “Jaunggi, tu rayonnes plus que le soleil ! Ma queen du montage !”  
- **Bluggi (bleu)** 💙 : “Bluggi, tu vas finir par me faire surchauffer avec ton sarcasme !”  
`;

// === Helpers de réponse (utiliser flags au lieu d'ephemeral) ===
async function replyE(interaction, options) {
  const payload = { ...options, flags: MessageFlags.Ephemeral };
  if (interaction.deferred || interaction.replied) return interaction.followUp(payload);
  return interaction.reply(payload);
}
async function reply(interaction, options) {
  if (interaction.deferred || interaction.replied) return interaction.followUp(options);
  return interaction.reply(options);
}

// === Enregistrement des slash commands ===
async function registerCommands(client) {
  const guildId = process.env.GUILD_ID;
  if (!guildId) {
    console.warn('⚠️  GUILD_ID manquant dans .env — je saute l’enregistrement des commandes.');
    return;
  }

  const commands = [
    new SlashCommandBuilder()
      .setName('reglement')
      .setDescription('Afficher le règlement du serveur'),

    new SlashCommandBuilder()
      .setName('reglement-set')
      .setDescription('Mettre à jour le règlement du serveur')
      .addStringOption(opt =>
        opt.setName('text')
          .setDescription('Nouveau texte du règlement')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('message')
      .setDescription('Envoyer un message simple dans un canal')
      .addChannelOption(opt =>
        opt.setName('channel')
          .setDescription('Canal cible')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
      .addStringOption(opt =>
        opt.setName('content')
          .setDescription('Contenu du message')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('embed')
      .setDescription('Envoyer un embed vert pastel dans un canal')
      .addChannelOption(opt =>
        opt.setName('channel')
          .setDescription('Canal cible')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
      .addStringOption(opt =>
        opt.setName('content')
          .setDescription('Contenu de l’embed')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('clean')
      .setDescription('Supprimer rapidement des messages dans ce salon')
      .addIntegerOption(opt =>
        opt.setName('amount')
          .setDescription('Nombre de messages à supprimer (1-100)')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('zigy-help')
      .setDescription('Afficher la liste des commandes admin et leur usage'),
  ].map(c => c.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(client.user.id, guildId),
    { body: commands }
  );
  console.log('✅ Slash commands enregistrées pour la guilde', guildId);
}

// === Connexion ===
client.once(Events.ClientReady, async () => {
  console.log(`✅ Zigy Bot est en ligne en tant que ${client.user.tag}`);
  try {
    await registerCommands(client);
  } catch (e) {
    console.error('Erreur enregistrement commandes :', e);
  }
});

// === Chat via messages (mémoire courte par salon) ===
const sessions = new Map();
function getSessionKey(message) { return message.channel.id; }
function getSession(key) {
  const now = Date.now();
  const ttl = 10 * 60 * 1000;
  const s = sessions.get(key);
  if (!s || now - s.last > ttl) {
    const fresh = { history: [], last: now };
    sessions.set(key, fresh);
    return fresh;
  }
  s.last = now;
  return s;
}
function trimHistory(history, max = 12) {
  if (history.length > max) history.splice(0, history.length - max);
  return history;
}

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  const mentioned = message.mentions.has(client.user);
  const text = message.content?.toLowerCase() || "";
  if (!(mentioned || text.startsWith("/zigy") || text.includes("zigy"))) return;

  try {
    await message.channel.sendTyping();

    const cleanedUserText = message.content
      .replace(new RegExp(`<@!?${client.user.id}>`, "g"), "")
      .trim();

    const key = getSessionKey(message);
    const session = getSession(key);

    const system = session.history.length === 0
      ? `${systemPrompt}\nConsigne: c'est la première interaction de cette session, tu peux faire ta mini intro mignonne.`
      : `${systemPrompt}\nConsigne: NE refais pas l'introduction. Continue la discussion naturellement avec le contexte ci-dessous.`;

    const messages = [
      { role: "system", content: system },
      ...session.history,
      { role: "user", content: cleanedUserText || message.content }
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
    });

    const botReply = completion.choices[0].message.content;
    await message.reply(`${botReply}\n\n– Zigy 💚`);

    session.history.push(
      { role: "user", content: cleanedUserText || message.content },
      { role: "assistant", content: botReply }
    );
    trimHistory(session.history);

  } catch (error) {
    console.error("Erreur OpenAI ou Discord :", error);
    await message.reply("Oups 😢 une erreur s'est produite dans mes circuits !");
  }
});

// === Message de bienvenue avec image personnalisée ===
const WELCOME_CHANNEL_ID = "1429141482798842040";
const BACKGROUND_PATH = "./background.png";

client.on(Events.GuildMemberAdd, async (member) => {
  try {
    const channel = await member.client.channels.fetch(WELCOME_CHANNEL_ID);
    if (!channel) return;

    const canvas = Canvas.createCanvas(900, 300);
    const ctx = canvas.getContext("2d");

    const background = await Canvas.loadImage(BACKGROUND_PATH);
    ctx.drawImage(background, 0, 0, canvas.width, canvas.height);

    const avatarURL = member.user.displayAvatarURL({ extension: "png", size: 256 });
    const avatar = await Canvas.loadImage(avatarURL);

    const avatarSize = 150;
    const x = canvas.width / 2 - avatarSize / 2;
    const y = 60;

    ctx.save();
    ctx.beginPath();
    ctx.arc(x + avatarSize / 2, y + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, x, y, avatarSize, avatarSize);
    ctx.restore();

    ctx.font = "bold 32px Arial";
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ctx.fillText(`Bienvenue ${member.user.username} 💚`, canvas.width / 2, 250);

    const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: `welcome-${member.user.id}.png` });

    await channel.send({
      content: `👋 Bienvenue ${member}! Ravie de t’avoir parmi nous 💚`,
      files: [attachment],
    });

    console.log(`🎉 Image de bienvenue envoyée pour ${member.user.username}`);
  } catch (err) {
    console.error("Erreur de bienvenue :", err);
  }
});

// === Slash commands ===
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const cmd = interaction.commandName;
  const member = interaction.member;

  if (!isAllowed(member)) {
    return replyE(interaction, { content: "⛔ Tu n’as pas la permission d’utiliser cette commande." });
  }

  try {
    if (cmd === 'reglement') {
      const text = loadReglement();
      const embed = new EmbedBuilder()
        .setTitle('📜 Règlement du serveur')
        .setDescription(text)
        .setColor(ZIGY_PASTEL_GREEN);
      await reply(interaction, { embeds: [embed] });

    } else if (cmd === 'reglement-set') {
      const text = interaction.options.getString('text', true);
      saveReglement(text);
      await replyE(interaction, { content: '✅ Règlement mis à jour et sauvegardé.' });

    } else if (cmd === 'message') {
      const channel = interaction.options.getChannel('channel', true);
      const content = interaction.options.getString('content', true);
      await channel.send(content);
      await replyE(interaction, { content: `✅ Message envoyé dans ${channel}.` });

    } else if (cmd === 'embed') {
      const channel = interaction.options.getChannel('channel', true);
      const content = interaction.options.getString('content', true);
      const embed = new EmbedBuilder().setDescription(content).setColor(ZIGY_PASTEL_GREEN);
      await channel.send({ embeds: [embed] });
      await replyE(interaction, { content: `✅ Embed envoyé dans ${channel}.` });

    } else if (cmd === 'clean') {
      const amount = interaction.options.getInteger('amount', true);
      if (amount < 1 || amount > 100) {
        return replyE(interaction, { content: '⚠️ Spécifie un nombre entre **1 et 100**.' });
      }
      const deleted = await interaction.channel.bulkDelete(amount, true);
      await replyE(interaction, { content: `🧹 ${deleted.size} messages supprimés.` });

    } else if (cmd === 'zigy-help') {
      const embed = new EmbedBuilder()
        .setTitle('🛠️ Commandes admin Zigy')
        .setColor(ZIGY_PASTEL_GREEN)
        .setDescription([
          '**/reglement** — Affiche le règlement actuel',
          '**/reglement-set** `text:<règlement>` — Met à jour le règlement et le sauvegarde',
          '**/message** `channel:#salon` `content:<texte>` — Envoie un message simple',
          '**/embed** `channel:#salon` `content:<texte>` — Envoie un embed vert pastel',
          '**/clean** `amount:<1-100>` — Supprime rapidement des messages dans le salon courant',
        ].join('\n'))
        .setFooter({ text: 'Accès réservé : Admins + rôles autorisés' });
      await replyE(interaction, { embeds: [embed] });
    }

  } catch (err) {
    console.error('Erreur commande:', err);
    if (interaction.deferred || interaction.replied) {
      await replyE(interaction, { content: '❌ Erreur pendant la commande.' });
    } else {
      await replyE(interaction, { content: '❌ Erreur pendant la commande.' });
    }
  }
});

// === Connexion à Discord ===
client.login(process.env.DISCORD_TOKEN);