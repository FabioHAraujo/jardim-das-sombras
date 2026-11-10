import { Bot, InputFile } from 'grammy';
import dotenv from 'dotenv';
import sharp from 'sharp';
import { ShadowGardenClient, FarmStatus, DailyResponse } from './client.js';
import { t, e } from './texts.js';

dotenv.config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

if (!BOT_TOKEN) {
  console.error('❌ ERRO: Variável TELEGRAM_BOT_TOKEN não encontrada no .env!');
}

const client = new ShadowGardenClient(process.env.API_URL || 'http://localhost:3040');

export const bot = new Bot(BOT_TOKEN || 'MISSING_TOKEN');

// Global logger and prefix normalizer (!cmd -> /cmd)
bot.use(async (ctx, next) => {
  if (ctx.message?.text) {
    const rawText = ctx.message.text.trim();
    console.log(`📩 [TG ${ctx.from?.id} - ${ctx.from?.first_name}]: "${rawText}"`);
    if (rawText.startsWith('!')) {
      const converted = '/' + rawText.slice(1);
      ctx.message.text = converted;
      if (ctx.msg) ctx.msg.text = converted;
      if (ctx.update.message) ctx.update.message.text = converted;
      // Synthesize bot_command entity so grammy's bot.command() triggers automatically
      const cmdWord = converted.split(' ')[0];
      const entities = ctx.message.entities || [];
      if (!entities.some((e) => e.type === 'bot_command')) {
        ctx.message.entities = [
          { type: 'bot_command', offset: 0, length: cmdWord.length },
          ...entities,
        ];
        if (ctx.update.message) {
          ctx.update.message.entities = ctx.message.entities;
        }
      }
    }
  }
  await next();
});

function formatTime(seconds: number): string {
  if (seconds <= 0) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function buildFarmCaption(status: FarmStatus, username: string, adminUrl?: string | null): string {
  let text = t('bot.farmTitle', { username }, '🦇 *Jardim das Sombras de @{username}*') + '\n';
  text += `${e('coins', '🌱')} Petalitas: *${status.coins.toLocaleString('pt-BR')} Ptl* | ${e('harvests', '🌾')} Colheitas: *${status.stats.totalHarvested}* | ${e('withered', '💀')} Mortas: *${status.stats.totalWithered}*\n\n`;

  let emptyCount = 0;
  for (const s of status.slots) {
    if (s.stage === 'empty') {
      emptyCount++;
      text += `[${s.slotIndex}] ${e('empty', '🟫')} *Vazio*\n`;
    } else if (s.stage === 'seed') {
      text += `[${s.slotIndex}] ${e('seed', '🌰')} *${s.plantName}* (Semente) - ⏳ ${formatTime(s.remainingSecondsToHarvest)}\n`;
    } else if (s.stage === 'growing') {
      text += `[${s.slotIndex}] ${e('growing', '🌱')} *${s.plantName}* (Crescendo) - ⏳ ${formatTime(s.remainingSecondsToHarvest)}\n`;
    } else if (s.stage === 'ready') {
      text += `[${s.slotIndex}] ${e('ready', '✨')} *${s.plantName}* (*Pronta para Colher!*) - ⚠️ Apodrece em < ${formatTime(s.remainingSecondsToWither)}\n`;
    } else if (s.stage === 'withered') {
      emptyCount++;
      text += `[${s.slotIndex}] ${e('withered', '💀')} *${s.plantName}* (*Apodrecida - Livre para Plantar*)\n`;
    }
  }

  // Count available seeds in inventory
  const totalSeeds = (status.inventory || [])
    .filter((i: any) => !i.itemId.startsWith('crop_') && !i.itemId.startsWith('decor_') && i.quantity > 0)
    .reduce((sum: number, i: any) => sum + i.quantity, 0);

  text += `\n🌱 *${emptyCount} slots livres, ${totalSeeds} sementes disponíveis para plantar no seu !inventario*\n`;

  text += `\n💡 *Comandos Rápidos:*\n`;
  text += `• \`!plantar [slot] [item]\` ou \`!plantar_tudo [item]\`\n`;
  text += `• \`!colher\` ou \`!colher_tudo\`\n`;
  text += `• \`!loja\` | \`!inventario\` | \`!vender_tudo\`\n`;

  // Display admin url if available, otherwise display public share url
  if (adminUrl) {
    text += `\n> ${adminUrl}`;
  } else {
    const shareUrl = status.shareUrl || (status.uuid ? `${process.env.PUBLIC_URL || process.env.API_URL || 'http://localhost:3040'}/farm?id=${status.uuid}` : null);
    if (shareUrl) {
      text += `\n> ${shareUrl}`;
    }
  }

  return text;
}

/**
 * Detect coordinates of user-placed marker/emoji by comparing user image with current farm image.
 * Uses optimized 256x256 comparison grid (16x faster, <5ms execution).
 */
async function detectMarkerCoordinates(userImageBuffer: Buffer, baseFarmBuffer: Buffer): Promise<{ x: number; y: number } | null> {
  const processSize = 256;
  const scale = 1024 / processSize;

  const [userRaw, baseRaw] = await Promise.all([
    sharp(userImageBuffer).resize(processSize, processSize).raw().toBuffer({ resolveWithObject: true }),
    sharp(baseFarmBuffer).resize(processSize, processSize).raw().toBuffer({ resolveWithObject: true }),
  ]);

  const userBytes = userRaw.data;
  const baseBytes = baseRaw.data;
  const userChannels = userRaw.info.channels;
  const baseChannels = baseRaw.info.channels;

  let totalDiffX = 0;
  let totalDiffY = 0;
  let diffCount = 0;

  for (let y = 0; y < processSize; y++) {
    for (let x = 0; x < processSize; x++) {
      const uIdx = (y * processSize + x) * userChannels;
      const bIdx = (y * processSize + x) * baseChannels;

      const dr = Math.abs(userBytes[uIdx] - baseBytes[bIdx]);
      const dg = Math.abs(userBytes[uIdx + 1] - baseBytes[bIdx + 1]);
      const db = Math.abs(userBytes[uIdx + 2] - baseBytes[bIdx + 2]);

      // Detect strong pixel changes (emoji, stickers, brush marks)
      if (dr + dg + db > 80) {
        totalDiffX += x;
        totalDiffY += y;
        diffCount++;
      }
    }
  }

  // Minimum threshold calibrated for 256x256 grid
  if (diffCount < 5) {
    return null;
  }

  return {
    x: Math.round((totalDiffX / diffCount) * scale),
    y: Math.round((totalDiffY / diffCount) * scale),
  };
}

// /start & /ajuda
bot.command(['start', 'ajuda', 'help'], async (ctx) => {
  const msg =
    t('bot.welcome', {}, '🦇 *Bem-vindo ao Jardim das Sombras!* (Ravena-AI Farm)') + `\n\n` +
    `Minigame de cultivo gótico em pixel art 2.5D.\n\n` +
    `📖 *Comandos Disponíveis:*\n` +
    `• \`!fazenda\` (ou \`/fazenda\`) — Abre sua fazenda e coleta a Sacola do Coveiro diária automaticamente\n` +
    `• \`!colher\` ou \`!colher_tudo\` — Colhe plantas prontas\n` +
    `• \`!plantar [slot] [semente]\` — Planta em canteiro específico (1 a 9)\n` +
    `• \`!plantar_tudo [semente]\` — Enche todos os canteiros livres\n` +
    `• \`!usar [elixir]\` — Consome um elixir ou item especial\n` +
    `• \`!loja\` — Exibe itens numerados do empório\n` +
    `• \`!comprar [número ou nome] [qtd]\` — Compra sementes, elixires ou enfeites\n` +
    `• \`!inventario\` — Mostra suas sementes, elixires e decorações\n` +
    `• \`!vender [número ou nome] [qtd]\` — Vende sementes/colheitas\n` +
    `• \`!vender_tudo\` — Vende todas as colheitas do inventário\n` +
    `• \`!decorar [enfeite]\` — Posiciona enfeite no terreno\n\n` +
    `Envie \`!fazenda\` para começar!`;

  await ctx.reply(msg, { parse_mode: 'Markdown' });
});

// /fazenda ou /jardim (Comando Principal)
bot.command(['fazenda', 'jardim', 'farm'], async (ctx) => {
  const userId = String(ctx.from?.id);
  const username = ctx.from?.username || ctx.from?.first_name || 'Cultivador';
  const isPrivate = ctx.chat?.type === 'private';

  try {
    await ctx.replyWithChatAction('upload_photo');

    // 1. Fetch farm image and status, admin url if private, and attempt auto-daily collection in parallel
    const [status, imageBuffer, dailyResult, adminData] = await Promise.all([
      client.getStatus(userId),
      client.getImageBuffer(userId, true, username),
      client.claimDaily(userId).catch((): DailyResponse => ({ claimed: false, alreadyClaimed: true })),
      isPrivate ? client.getAdminUrl(userId).catch(() => null) : Promise.resolve(null),
    ]);

    // 2. Send Farm image with status caption (or split if > 800 chars)
    const caption = buildFarmCaption(status, username, adminData?.url);

    if (caption.length > 800) {
      await ctx.replyWithPhoto(new InputFile(imageBuffer, 'fazenda.png'));
      await ctx.reply(caption, { parse_mode: 'Markdown' });
    } else {
      await ctx.replyWithPhoto(new InputFile(imageBuffer, 'fazenda.png'), {
        caption,
        parse_mode: 'Markdown',
      });
    }

    // 3. If daily reward was collected on this command, send separate message below
    if (dailyResult.claimed && dailyResult.coinsWon) {
      let dailyMsg = `🎁 *Sacola do Coveiro Coletada!* (Bônus Diário)\n`;
      dailyMsg += `🌱 Petalitas encontradas: *+${dailyResult.coinsWon.toLocaleString('pt-BR')} Ptl*\n`;
      if (dailyResult.itemsWon && dailyResult.itemsWon.length > 0) {
        dailyMsg += `🌱 Sementes recebidas:\n`;
        for (const it of dailyResult.itemsWon) {
          dailyMsg += `• *${it.name}* (x${it.count})\n`;
        }
      }
      dailyMsg += `\n_Volte amanhã para resgatar mais recompensas!_`;
      await ctx.reply(dailyMsg, { parse_mode: 'Markdown' });
    }
  } catch (err: any) {
    await ctx.reply(`❌ Erro ao abrir fazenda: ${err.message}`);
  }
});

// /fazenda_admin ou /admin ou /gerenciar
bot.command(['fazenda_admin', 'fazenda-admin', 'admin', 'gerenciar'], async (ctx) => {
  const userId = String(ctx.from?.id);
  const isPrivate = ctx.chat?.type === 'private';

  try {
    const res = await client.getAdminUrl(userId);
    const adminMsg =
      `👑 *Painel de Gestão da Fazenda (Modo Admin)*\n\n` +
      `Acesse pelo link abaixo para organizar enfeites arrastando pela tela, comprar e vender itens diretamente pela web:\n\n` +
      `> ${res.url}\n\n` +
      `⏱️ _Este link é individual e expira em 30 minutos._`;

    if (isPrivate) {
      await ctx.reply(adminMsg, { parse_mode: 'Markdown' });
    } else {
      // Grupo: envia no privado do usuário para não expor o link de admin no grupo
      try {
        await ctx.api.sendMessage(userId, adminMsg, { parse_mode: 'Markdown' });
        await ctx.reply(`📩 *${ctx.from?.first_name || 'Agricultor'}*, enviei o seu link seguro de administração no privado!`, {
          parse_mode: 'Markdown',
        });
      } catch (pvErr) {
        await ctx.reply(
          `⚠️ *${ctx.from?.first_name || 'Agricultor'}*, não consegui te enviar mensagem no privado. Por favor, envie uma mensagem para o bot no privado primeiro!`,
          { parse_mode: 'Markdown' }
        );
      }
    }
  } catch (err: any) {
    await ctx.reply(`❌ Erro ao gerar link de administração: ${err.message}`);
  }
});

// /colher ou /colher_tudo
bot.command(['colher', 'colher_tudo'], async (ctx) => {
  const userId = String(ctx.from?.id);
  const args = ctx.message?.text.split(' ').slice(1);
  const slot = args && args[0] ? parseInt(args[0]) : undefined;

  try {
    const res = await client.harvest(userId, slot, true);
    let msg = `🌾 *Colheita Realizada com Sucesso!*\n\n`;
    msg += `🌱 Petalitas Totais: *+${res.totalCoinsEarned.toLocaleString('pt-BR')} Ptl*\n`;
    if (res.clearedWitheredCount > 0) {
      msg += `🧹 Plantas apodrecidas removidas: *${res.clearedWitheredCount}*\n`;
    }

    if (res.harvested && res.harvested.length > 0) {
      msg += `\n📦 *Itens e Bônus Despachados:*\n`;
      for (const h of res.harvested) {
        msg += `• *${h.name}* (x${h.count}) -> +${h.coinsEarned.toLocaleString('pt-BR')} Ptl\n`;
      }
    }

    await ctx.reply(msg, { parse_mode: 'Markdown' });
  } catch (err: any) {
    await ctx.reply(`⚠️ ${err.message}`);
  }
});

// /plantar [slot] [item]
bot.command('plantar', async (ctx) => {
  const userId = String(ctx.from?.id);
  const parts = ctx.message?.text.split(' ').slice(1);

  if (!parts || parts.length < 1) {
    return ctx.reply('💡 Uso: `!plantar [slot 1 a 9] [número ou nome da semente]` (ex: `!plantar 1 1` ou `!plantar 1 erva`)', {
      parse_mode: 'Markdown',
    });
  }

  let slot: number | undefined = undefined;
  let item = parts[0];

  if (!isNaN(parseInt(parts[0])) && parts[1]) {
    slot = parseInt(parts[0]);
    item = parts[1];
  }

  try {
    const res = await client.plant(userId, item, slot, 1);
    await ctx.reply(`🌱 Plantado com sucesso! *${res.plantName}* no canteiro [${res.slots.join(', ')}].`, {
      parse_mode: 'Markdown',
    });
  } catch (err: any) {
    await ctx.reply(`⚠️ ${err.message}`);
  }
});

// /plantar_tudo [semente]
bot.command('plantar_tudo', async (ctx) => {
  const userId = String(ctx.from?.id);
  const parts = ctx.message?.text.split(' ').slice(1);
  if (!parts || parts.length < 1) {
    return ctx.reply('💡 Uso: `!plantar_tudo [número ou nome da semente]` (ex: `!plantar_tudo 1` ou `!plantar_tudo erva`)', {
      parse_mode: 'Markdown',
    });
  }

  const item = parts[0];
  try {
    const res = await client.plant(userId, item, undefined, 9);
    await ctx.reply(`🌱 Plantio em lote! *${res.plantedCount}x ${res.plantName}* nos canteiros [${res.slots.join(', ')}].`, {
      parse_mode: 'Markdown',
    });
  } catch (err: any) {
    await ctx.reply(`⚠️ ${err.message}`);
  }
});

// /loja (Numerada com sementes, consumíveis e enfeites)
bot.command('loja', async (ctx) => {
  const userId = String(ctx.from?.id);
  try {
    const shop = await client.getShop(userId);
    let msg = `🛒 *Empório Sombrio — Catálogo Geral*\n\n`;

    msg += `🌱 *Sementes Místicas (1 a 12):*\n`;
    for (const s of shop.seeds) {
      msg += `[${s.index}] *${s.name}* — 🌱 ${s.price} Ptl (⏳ ${s.growthMinutes}m)\n`;
      msg += `   _${s.description}_ [Hoje: ${s.remainingToday}/${s.dailyLimit}]\n`;
    }

    if (shop.consumables && shop.consumables.length > 0) {
      msg += `\n⚗️ *Consumíveis & Elixires (31 a 39):*\n`;
      for (const c of shop.consumables) {
        msg += `[${c.index}] *${c.name}* — 🌱 ${c.price.toLocaleString('pt-BR')} Ptl\n`;
        msg += `   _${c.description}_ [Hoje: ${c.remainingToday}/${c.dailyLimit}]\n`;
      }
    }

    msg += `\n🥉 *Enfeites Simples — 500k Ptl (13 a 18):*\n`;
    for (const d of shop.decorations.filter((x) => x.tier === 'simples')) {
      msg += `[${d.index}] ${d.name}\n`;
    }

    msg += `\n🥈 *Enfeites Médios — 1.5M Ptl (19 a 24):*\n`;
    for (const d of shop.decorations.filter((x) => x.tier === 'medio')) {
      msg += `[${d.index}] ${d.name}\n`;
    }

    msg += `\n🥇 *Enfeites de Prestígio — 6.66M Ptl (25 a 30):*\n`;
    for (const d of shop.decorations.filter((x) => x.tier === 'complexo')) {
      msg += `[${d.index}] ${d.name}\n`;
    }

    msg += `\n💡 *Para Comprar:*\n`;
    msg += `\`!comprar [número ou nome] [quantidade]\`\n`;
    msg += `Exemplo: \`!comprar 1 5\` (compra 5x Erva-Moura) ou \`!comprar 31\` (compra Rubi Sanguíneo)`;

    await ctx.reply(msg, { parse_mode: 'Markdown' });
  } catch (err: any) {
    await ctx.reply(`❌ ${err.message}`);
  }
});

// /comprar [item] [qtd]
bot.command('comprar', async (ctx) => {
  const userId = String(ctx.from?.id);
  const parts = ctx.message?.text.split(' ').slice(1);
  if (!parts || parts.length < 1) {
    return ctx.reply('💡 Uso: `!comprar [número ou nome] [quantidade]` (ex: `!comprar 1 5` ou `!comprar 13`)', {
      parse_mode: 'Markdown',
    });
  }

  const itemId = parts[0];
  const qty = parts[1] ? parseInt(parts[1]) : 1;

  try {
    const res = await client.buy(userId, itemId, qty);

    const caption =
      `✅ *Compra realizada com sucesso!*\n` +
      `📦 Item: *[${res.itemIndex}] ${res.itemName}* (x${res.quantityBought})\n` +
      `🌱 Total Pago: *${res.totalCost.toLocaleString('pt-BR')} Ptl*\n` +
      `🌱 Saldo Atual: *${res.remainingCoins.toLocaleString('pt-BR')} Ptl*`;

    if (res.stickerBase64) {
      const base64Data = res.stickerBase64.replace(/^data:image\/\w+;base64,/, '');
      const stickerBuffer = Buffer.from(base64Data, 'base64');
      // Envia como sticker/sticker WEBP/PNG
      try {
        await ctx.replyWithSticker(new InputFile(stickerBuffer, 'item_sticker.webp'));
        await ctx.reply(caption, { parse_mode: 'Markdown' });
      } catch (stickerErr) {
        // Fallback para photo caso o Telegram exija formato estrito de sticker
        await ctx.replyWithPhoto(new InputFile(stickerBuffer, 'item.png'), {
          caption,
          parse_mode: 'Markdown',
        });
      }
    } else {
      await ctx.reply(caption, { parse_mode: 'Markdown' });
    }
  } catch (err: any) {
    await ctx.reply(`⚠️ ${err.message}`);
  }
});

function parseDecorarArgs(args: string[]): { itemQuery: string; slotIndex: number; x?: number; y?: number } {
  if (args.length === 0) return { itemQuery: '', slotIndex: 1 };

  // Caso 1: Duas últimas partes são coordenadas numéricas X e Y (ex: !decorar fonte de sangue 250 650)
  if (args.length >= 3) {
    const lastX = parseInt(args[args.length - 2]);
    const lastY = parseInt(args[args.length - 1]);
    if (!isNaN(lastX) && !isNaN(lastY) && lastX >= 0 && lastX <= 1024 && lastY >= 0 && lastY <= 1024) {
      const itemQuery = args.slice(0, args.length - 2).join(' ').trim();
      return { itemQuery, slotIndex: 1, x: lastX, y: lastY };
    }
  }

  // Caso 2: Última parte é coordenada no formato X,Y (ex: !decorar fonte de sangue 250,650)
  const lastArg = args[args.length - 1];
  if (lastArg.includes(',')) {
    const [sx, sy] = lastArg.split(',');
    const x = parseInt(sx);
    const y = parseInt(sy);
    if (!isNaN(x) && !isNaN(y)) {
      const itemQuery = args.slice(0, args.length - 1).join(' ').trim();
      return { itemQuery, slotIndex: 1, x, y };
    }
  }

  // Caso 3: Última parte é o slot fixo 1 a 4 (ex: !decorar fonte de sangue 2 ou !decorar 21 3)
  const maybeSlot = parseInt(lastArg);
  if (!isNaN(maybeSlot) && maybeSlot >= 1 && maybeSlot <= 4 && args.length > 1) {
    const itemQuery = args.slice(0, args.length - 1).join(' ').trim();
    return { itemQuery, slotIndex: maybeSlot };
  }

  // Caso 4: Apenas o nome ou número do item (ex: !decorar fonte de sangue ou !decorar 21) -> slot 1 padrão
  return { itemQuery: args.join(' ').trim(), slotIndex: 1 };
}

// /inventario ou /mochila
bot.command(['inventario', 'inv', 'mochila'], async (ctx) => {
  const userId = String(ctx.from?.id);
  try {
    const inv = await client.getInventory(userId);
    let msg = `🎒 *Inventário de Cultivo*\n`;
    msg += `🌱 Saldo: *${inv.coins.toLocaleString('pt-BR')} Ptl*\n\n`;

    if (!inv.items || inv.items.length === 0) {
      msg += `_Seu inventário está vazio. Colete a !fazenda diária ou compre na !loja._`;
    } else {
      const crops = inv.items.filter((it) => it.type === 'crop');
      const seeds = inv.items.filter((it) => it.type === 'seed');
      const consumables = inv.items.filter((it) => it.type === 'consumable');
      const decors = inv.items.filter((it) => it.type === 'decoration');
      const others = inv.items.filter(
        (it) => it.type !== 'seed' && it.type !== 'crop' && it.type !== 'consumable' && it.type !== 'decoration'
      );

      if (crops.length > 0) {
        msg += `🌾 *Plantas Colhidas (Colheitas para Vender):*\n`;
        for (const it of crops) {
          const idStr = it.catalogIndex || it.baseId || it.itemId;
          msg += `• [ID:${idStr}] *${it.name}* - x${it.quantity}\n`;
        }
        msg += `\n`;
      }

      if (seeds.length > 0) {
        msg += `🌱 *Sementes (Para Plantar):*\n`;
        for (const it of seeds) {
          const idStr = it.catalogIndex || it.baseId || it.itemId;
          msg += `• [ID:${idStr}] *${it.name}* - x${it.quantity}\n`;
        }
        msg += `\n`;
      }

      if (consumables.length > 0) {
        msg += `⚗️ *Consumíveis & Elixires:*\n`;
        for (const it of consumables) {
          const idStr = it.catalogIndex || it.baseId || it.itemId;
          msg += `• [ID:${idStr}] *${it.name}* - x${it.quantity}\n`;
        }
        msg += `\n`;
      }

      if (decors.length > 0) {
        msg += `🏛️ *Decorações na Mochila:*\n`;
        for (const it of decors) {
          const idStr = it.catalogIndex || it.baseId || it.itemId;
          msg += `• [ID:${idStr}] *${it.name}* - x${it.quantity}\n`;
        }
        msg += `\n`;
      }

      if (others.length > 0) {
        msg += `📦 *Outros Itens:*\n`;
        for (const it of others) {
          const idStr = it.catalogIndex || it.baseId || it.itemId;
          msg += `• [ID:${idStr}] *${it.name}* - x${it.quantity}\n`;
        }
        msg += `\n`;
      }

      msg += `💡 *Comandos Úteis:*\n`;
      msg += `• *Usar Elixir:* \`!usar [ID]\` (ex: \`!usar 31\`)\n`;
      msg += `• *Plantar:* \`!plantar [slot] [ID]\` (ex: \`!plantar 1 1\`)\n`;
      msg += `• *Plantar Tudo:* \`!plantar_tudo [ID]\` (ex: \`!plantar_tudo 1\`)\n`;
      msg += `• *Vender Colheitas:* \`!vender [ID] [qtd]\` ou \`!vender_tudo\`\n`;
      msg += `• *Posicionar Enfeites:* Use \`!fazenda-admin\` para arrastar livremente pela tela na web! (Ou \`!decorar [ID] [x] [y]\`)\n`;
    }

    await ctx.reply(msg, { parse_mode: 'Markdown' });
  } catch (err: any) {
    await ctx.reply(`❌ ${err.message}`);
  }
});

// /usar [item] [slot?]
bot.command(['usar', 'use'], async (ctx) => {
  const userId = String(ctx.from?.id);
  const parts = ctx.message?.text.split(' ').slice(1);
  if (!parts || parts.length < 1) {
    return ctx.reply('💡 Uso: `!usar [número ou nome do elixir] [slot opcional]` (ex: `!usar 31` ou `!usar rubi`)', {
      parse_mode: 'Markdown',
    });
  }

  const itemId = parts[0];
  const slot = parts[1] && !isNaN(parseInt(parts[1])) ? parseInt(parts[1]) : undefined;

  try {
    const res = await client.useConsumable(userId, itemId, slot);
    await ctx.reply(res.message || `✨ Item consumido com sucesso!`, { parse_mode: 'Markdown' });
  } catch (err: any) {
    await ctx.reply(`⚠️ ${err.message}`);
  }
});

// /vender [item] [qtd]
bot.command('vender', async (ctx) => {
  const userId = String(ctx.from?.id);
  const parts = ctx.message?.text.split(' ').slice(1);
  if (!parts || parts.length < 1) {
    return ctx.reply('💡 Uso: `!vender [número ou nome] [quantidade]` ou `!vender_tudo`', {
      parse_mode: 'Markdown',
    });
  }

  // Suporte a quantidade no final e nome composto antes: ex: !vender rosa de sangue 3
  let qty = 1;
  let item = parts.join(' ').trim();

  const lastArg = parts[parts.length - 1];
  if (!isNaN(parseInt(lastArg)) && parts.length > 1) {
    qty = parseInt(lastArg);
    item = parts.slice(0, parts.length - 1).join(' ').trim();
  } else if (!isNaN(parseInt(parts[0])) && parts.length === 1) {
    // Se o usuário digitou o número do catálogo: ex: !vender 1
    item = parts[0];
  }

  try {
    const res = await client.sell(userId, { itemId: item, quantity: qty });
    let msg = `🌱 *Venda Realizada!*\n`;
    msg += `🌱 Petalitas Ganhas: *+${res.totalCoinsEarned.toLocaleString('pt-BR')} Ptl*\n`;
    for (const it of res.soldItems) {
      msg += `• *${it.name}* (x${it.quantity})\n`;
    }
    msg += `🌱 Novo Saldo: *${res.newCoinsBalance.toLocaleString('pt-BR')} Ptl*`;
    await ctx.reply(msg, { parse_mode: 'Markdown' });
  } catch (err: any) {
    await ctx.reply(`⚠️ ${err.message}`);
  }
});

// /vender_tudo
bot.command('vender_tudo', async (ctx) => {
  const userId = String(ctx.from?.id);
  try {
    const res = await client.sell(userId, { all: true });
    let msg = `🌱 *Venda Total Realizada!*\n`;
    msg += `🌱 Petalitas Ganhas: *+${res.totalCoinsEarned.toLocaleString('pt-BR')} Ptl*\n`;
    for (const it of res.soldItems) {
      msg += `• *${it.name}* (x${it.quantity})\n`;
    }
    msg += `🌱 Novo Saldo: *${res.newCoinsBalance.toLocaleString('pt-BR')} Ptl*`;
    await ctx.reply(msg, { parse_mode: 'Markdown' });
  } catch (err: any) {
    await ctx.reply(`⚠️ ${err.message}`);
  }
});

// /decorar [item] [x,y ou slot]
bot.command('decorar', async (ctx) => {
  const userId = String(ctx.from?.id);
  const parts = ctx.message?.text.split(' ').slice(1);
  if (!parts || parts.length < 1) {
    return ctx.reply(
      `🏛️ *Como Posicionar Enfeites:*\n\n` +
      `1. *Pelo Número da Loja/Mochila (Mais Fácil):*\n` +
      `   \`!decorar [número] [slot 1 a 4]\`\n` +
      `   _Exemplo:_ \`!decorar 13 1\` ou \`!decorar 21 2\`\n\n` +
      `2. *Pelo Nome (Inclusive Nomes Compostos):*\n` +
      `   \`!decorar fonte de sangue 1\` ou \`!decorar gargula 2\`\n\n` +
      `3. *Por Coordenadas Livres (X, Y):*\n` +
      `   \`!decorar 21 200,750\` ou \`!decorar fonte de sangue 200 750\`\n\n` +
      `4. *Via Foto com Emoji 📍 (Ideal no WhatsApp):*\n` +
      `   Envie a imagem da fazenda com a legenda \`!decorar [item]\` e um emoji 📍 no local desejado!\n\n` +
      `*(Slots fixos: 1=Noroeste, 2=Nordeste, 3=Sudoeste, 4=Sudeste)*`,
      { parse_mode: 'Markdown' }
    );
  }

  const { itemQuery, slotIndex, x, y } = parseDecorarArgs(parts);

  try {
    const res = await client.decorate(userId, { decorId: itemQuery, slotIndex, x, y });
    await ctx.reply(`🏛️ Enfeite *${res.name}* posicionado com sucesso no terreno! Envie \`!fazenda\` para visualizar.`, {
      parse_mode: 'Markdown',
    });
  } catch (err: any) {
    await ctx.reply(`⚠️ ${err.message}`);
  }
});

// Photo handler: detect emoji on photo with caption !decorar [item]
bot.on('message:photo', async (ctx) => {
  const caption = ctx.message.caption?.trim() || '';
  if (!caption.startsWith('!decorar') && !caption.startsWith('/decorar') && !caption.startsWith('!posicionar')) {
    return;
  }

  const parts = caption.split(' ').slice(1);
  if (parts.length < 1) {
    return ctx.reply('💡 Envie a foto com a legenda: `!decorar [número ou nome do enfeite]`', {
      parse_mode: 'Markdown',
    });
  }

  const decorItem = parts.join(' ').trim();
  const userId = String(ctx.from.id);

  try {
    await ctx.reply('🔍 Analisando posição do emoji na foto da fazenda...');

    // 1. Get highest resolution photo from user
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const file = await ctx.api.getFile(photo.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;

    const userImgRes = await fetch(fileUrl);
    const userImgBuffer = Buffer.from(await userImgRes.arrayBuffer());

    // 2. Get current farm image
    const baseFarmBuffer = await client.getImageBuffer(userId);

    // 3. Detect marker coordinates
    const coords = await detectMarkerCoordinates(userImgBuffer, baseFarmBuffer);

    if (!coords) {
      return ctx.reply('⚠️ Não consegui detectar o emoji/marcador na foto. Coloque um emoji contrastante (ex: 📍 ou 🎯) no local desejado.');
    }

    // 4. Equip decoration at detected coordinates
    const res = await client.decorate(userId, {
      decorId: decorItem,
      slotIndex: 1,
      x: coords.x,
      y: coords.y,
    });

    await ctx.reply(`✨ Enfeite *${res.name}* posicionado com sucesso no terreno! Envie \`!fazenda\` para contemplar.`, {
      parse_mode: 'Markdown',
    });
  } catch (err: any) {
    await ctx.reply(`⚠️ ${err.message}`);
  }
});



export async function runBot() {
  console.log('🤖 Conectando Bot de Testes (Modo WhatsApp / Texto) ao Telegram...');
  await bot.start();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runBot().catch(console.error);
}
