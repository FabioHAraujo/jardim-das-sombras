import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CanvasRendererService } from '../src/services/CanvasRendererService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const outputDir = path.resolve(__dirname, '../../artwork/samples_user_header');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const sampleSlots = [
    { slotIndex: 1, plantId: '01_nightshade', stage: 'growing' as const, tooltipText: '[1] 01h 45m' },
    { slotIndex: 2, plantId: '02_tomb_shroom', stage: 'ready' as const, tooltipText: '[2] Pronto! (08h 12m)' },
    { slotIndex: 3, plantId: '03_corpse_lily', stage: 'seed' as const, tooltipText: '[3] 04h 30m' },
    { slotIndex: 4, plantId: '04_spectral_rose', stage: 'ready' as const, tooltipText: '[4] Pronto!' },
    { slotIndex: 5, plantId: '02_tomb_shroom', stage: 'withered' as const, tooltipText: '[5] Murchou' },
    { slotIndex: 6, plantId: null, stage: 'empty' as const, tooltipText: undefined },
  ];

  const styles = [
    { id: 1, filename: 'amostra_1_sticker_fiel.jpg', label: 'Estilo 1 - Pill Violeta Claro com Nome' },
    { id: 2, filename: 'amostra_2_brasao_real.jpg', label: 'Estilo 2 - Brasão Noturno (Morcego + FAZENDA DE)' },
    { id: 3, filename: 'amostra_3_gothic_elegance.jpg', label: 'Estilo 3 - Gothic Elegance (Losangos Dourados + Glow)' },
    { id: 4, filename: 'amostra_4_minimalista_compacto.jpg', label: 'Estilo 4 - Minimalista Compacto (Glassmorphism + JARDIM DE)' },
  ];

  const testUserName = 'Fazendeiro';

  for (const style of styles) {
    console.log(`Renderizando ${style.label}...`);
    const buffer = await CanvasRendererService.renderFarm({
      slots: sampleSlots,
      decorations: [],
      includeTooltips: true,
      tooltipStyle: 1,
      userName: testUserName,
      headerStyle: style.id,
    });

    const destPath = path.join(outputDir, style.filename);
    fs.writeFileSync(destPath, buffer);
    console.log(`Salvo em: ${destPath} (${buffer.length} bytes)`);
  }

  // Amostra Pós-Colheita com Fantasma Dourado
  console.log('Renderizando Amostra Pós-Colheita (Fantasma Dourado 50% + Tooltip "Colhido!")...');
  const harvestSlots = [
    { slotIndex: 1, plantId: '01_nightshade', stage: 'empty' as const, isGhost: true, tooltipText: '[1] ✦ Colhido!', tooltipStyle: 5 },
    { slotIndex: 2, plantId: '02_tomb_shroom', stage: 'empty' as const, isGhost: true, tooltipText: '[2] ✦ Colhido!', tooltipStyle: 5 },
    { slotIndex: 3, plantId: '03_corpse_lily', stage: 'growing' as const, tooltipText: '[3] 04h 30m' },
    { slotIndex: 4, plantId: null, stage: 'empty' as const, tooltipText: undefined },
    { slotIndex: 5, plantId: '02_tomb_shroom', stage: 'growing' as const, tooltipText: '[5] 01h 10m' },
  ];
  const harvestBuffer = await CanvasRendererService.renderFarm({
    slots: harvestSlots,
    decorations: [],
    includeTooltips: true,
    tooltipStyle: 1,
    userName: testUserName,
    headerStyle: 1,
  });
  const harvestPath = path.join(outputDir, 'amostra_pos_colheita_fantasma.jpg');
  fs.writeFileSync(harvestPath, harvestBuffer);
  console.log(`Salvo em: ${harvestPath} (${harvestBuffer.length} bytes)`);

  // Amostra Pós-Plantio com Tooltip Verde "Plantada!"
  console.log('Renderizando Amostra Pós-Plantio (Tooltip Verde + "Plantada!")...');
  const plantSlots = [
    { slotIndex: 1, plantId: '01_nightshade', stage: 'seed' as const, tooltipText: '[1] ✦ Plantada!', tooltipStyle: 4 },
    { slotIndex: 2, plantId: '01_nightshade', stage: 'seed' as const, tooltipText: '[2] ✦ Plantada!', tooltipStyle: 4 },
    { slotIndex: 3, plantId: '01_nightshade', stage: 'seed' as const, tooltipText: '[3] ✦ Plantada!', tooltipStyle: 4 },
    { slotIndex: 4, plantId: '03_corpse_lily', stage: 'growing' as const, tooltipText: '[4] 03h 15m' },
    { slotIndex: 5, plantId: null, stage: 'empty' as const, tooltipText: undefined },
  ];
  const plantBuffer = await CanvasRendererService.renderFarm({
    slots: plantSlots,
    decorations: [],
    includeTooltips: true,
    tooltipStyle: 1,
    userName: testUserName,
    headerStyle: 1,
  });
  const plantPath = path.join(outputDir, 'amostra_pos_plantio.jpg');
  fs.writeFileSync(plantPath, plantBuffer);
  console.log(`Salvo em: ${plantPath} (${plantBuffer.length} bytes)`);

  console.log('Todas as amostras foram geradas com sucesso!');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Erro ao gerar amostras:', err);
    process.exit(1);
  });
