import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

/**
 * Chroma key logic:
 * Detects neon green background while preserving plant greens (which are earthy, darker, or have balanced R/B).
 * Also performs green de-spill on anti-aliased edge pixels so no ugly green halo remains.
 */
function processChromaKey(buffer, width, height) {
  // buffer is RGBA (4 bytes per pixel)
  const out = Buffer.alloc(width * height * 4);

  for (let i = 0; i < buffer.length; i += 4) {
    const r = buffer[i];
    const g = buffer[i + 1];
    const b = buffer[i + 2];

    const maxRB = Math.max(r, b);
    const greenDiff = g - maxRB;

    // Strict green background detection
    if (g > 130 && g > r * 1.35 && g > b * 1.35 && greenDiff > 45) {
      // Background: fully transparent
      out[i] = 0;
      out[i + 1] = 0;
      out[i + 2] = 0;
      out[i + 3] = 0;
    } else if (greenDiff > 15 && g > 100) {
      // Edge pixel with green spill: blend alpha and suppress green fringe
      const alphaFactor = Math.max(0, 1 - (greenDiff - 15) / 30);
      out[i] = r;
      out[i + 1] = maxRB; // suppress green spill
      out[i + 2] = b;
      out[i + 3] = Math.round(255 * alphaFactor);
    } else {
      // Solid sprite pixel
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
      out[i + 3] = 255;
    }
  }

  return out;
}

/**
 * Find bounding box of non-transparent pixels, discarding tiny edge artifacts
 */
function getBoundingBox(rgbaBuffer, width, height) {
  let minX = width, maxX = 0, minY = height, maxY = 0;
  let count = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = rgbaBuffer[(y * width + x) * 4 + 3];
      if (alpha > 30) {
        count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  return { minX, maxX, minY, maxY, count };
}

/**
 * Slice a sheet into cells, chroma-key each, trim, and save as transparent PNG.
 */
async function processSheet(inputFile, rows, cols, cellDefinitions, outputDir, customSplits = null) {
  console.log(`\nProcessing: ${inputFile} (${rows} rows x ${cols} cols)...`);
  fs.mkdirSync(outputDir, { recursive: true });

  const image = sharp(inputFile);
  const metadata = await image.metadata();
  const sheetW = metadata.width;
  const sheetH = metadata.height;

  const colW = sheetW / cols;
  const rowH = sheetH / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const def = cellDefinitions.find((d) => d.row === r && d.col === c);
      if (!def) continue;

      let cellX, cellY, cellWidth, cellHeight;
      if (customSplits) {
        cellX = customSplits.xSplits[c];
        cellY = customSplits.ySplits[r];
        cellWidth = customSplits.xSplits[c + 1] - cellX;
        cellHeight = customSplits.ySplits[r + 1] - cellY;
      } else {
        cellX = Math.round(c * colW);
        cellY = Math.round(r * rowH);
        cellWidth = Math.round((c + 1) * colW) - cellX;
        cellHeight = Math.round((r + 1) * rowH) - cellY;
      }

      // Extract raw cell
      const rawCell = await sharp(inputFile)
        .extract({ left: cellX, top: cellY, width: cellWidth, height: cellHeight })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      // Apply Chroma Key
      const transparentData = processChromaKey(rawCell.data, rawCell.info.width, rawCell.info.height);

      // Bounding box for trimming
      const bbox = getBoundingBox(transparentData, rawCell.info.width, rawCell.info.height);

      if (bbox.count === 0) {
        console.warn(`[Empty] Row ${r}, Col ${c}: ${def.name}`);
        continue;
      }

      // Add small margin around bounding box (4px)
      const pad = 4;
      const cropLeft = Math.max(0, bbox.minX - pad);
      const cropTop = Math.max(0, bbox.minY - pad);
      const cropWidth = Math.min(rawCell.info.width - cropLeft, bbox.maxX - bbox.minX + 1 + pad * 2);
      const cropHeight = Math.min(rawCell.info.height - cropTop, bbox.maxY - bbox.minY + 1 + pad * 2);

      const outputPath = path.join(outputDir, `${def.name}.png`);

      // Save trimmed transparent sprite
      await sharp(transparentData, {
        raw: {
          width: rawCell.info.width,
          height: rawCell.info.height,
          channels: 4,
        },
      })
        .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
        .png({ compressionLevel: 9 })
        .toFile(outputPath);

      console.log(`Saved: ${outputPath} (${cropWidth}x${cropHeight})`);
    }
  }
}

async function run() {
  const assetsDir = path.resolve('assets');
  const plantsDir = path.join(assetsDir, 'sprites', 'plants');
  const decorDir = path.join(assetsDir, 'sprites', 'decorations');

  // 1. Economia (01 to 04)
  const economiaDefs = [];
  const economiaPlants = ['01_nightshade', '02_tomb_shroom', '03_corpse_lily', '04_black_lotus'];
  const stages = ['seed', 'growing', 'ready'];
  economiaPlants.forEach((plant, r) => {
    stages.forEach((stage, c) => {
      economiaDefs.push({ row: r, col: c, name: `${plant}_${stage}` });
    });
  });
  await processSheet('artwork/sprites_economia.jpeg', 4, 3, economiaDefs, plantsDir);

  // 2. Pesca 1 (05 to 08 v1)
  const pesca1Defs = [];
  const pesca1Plants = ['05_mist_crawler_v1', '06_styx_kelp_v1', '07_spectral_gourd_v1', '08_devouring_root_v1'];
  pesca1Plants.forEach((plant, r) => {
    stages.forEach((stage, c) => {
      pesca1Defs.push({ row: r, col: c, name: `${plant}_${stage}` });
    });
  });
  await processSheet('artwork/sprites_pesca1.jpeg', 4, 3, pesca1Defs, plantsDir);

  // 3. Pesca 2 (05 to 08 v2)
  const pesca2Defs = [];
  const pesca2Plants = ['05_mist_crawler_v2', '06_styx_kelp_v2', '07_spectral_gourd_v2', '08_devouring_root_v2'];
  pesca2Plants.forEach((plant, r) => {
    stages.forEach((stage, c) => {
      pesca2Defs.push({ row: r, col: c, name: `${plant}_${stage}` });
    });
  });
  await processSheet('artwork/sprites_pesca2.jpeg', 4, 3, pesca2Defs, plantsDir);

  // 4. Cassino & Waifus (09 to 12)
  const cassinoWaifusDefs = [];
  const cassinoWaifusPlants = ['09_obsidian_clover', '10_golden_clover', '11_purple_heart', '12_blood_rose'];
  cassinoWaifusPlants.forEach((plant, r) => {
    stages.forEach((stage, c) => {
      cassinoWaifusDefs.push({ row: r, col: c, name: `${plant}_${stage}` });
    });
  });
  await processSheet('artwork/sprites_cassino_waifus.jpeg', 4, 3, cassinoWaifusDefs, plantsDir);

  // 5. Decorative 1 (1 to 9)
  const decor1Items = [
    { row: 0, col: 0, name: 'decor_01_dark_mossy_boulders' },
    { row: 0, col: 1, name: 'decor_02_melted_candle_clusters' },
    { row: 0, col: 2, name: 'decor_03_forgotten_bones_skulls' },
    { row: 1, col: 0, name: 'decor_04_rotten_wood_signposts' },
    { row: 1, col: 1, name: 'decor_05_necrotic_mushroom_patches' },
    { row: 1, col: 2, name: 'decor_06_styx_puddles' },
    { row: 2, col: 0, name: 'decor_07_broken_iron_lanterns' },
    { row: 2, col: 1, name: 'decor_08_shale_tombstones' },
    { row: 2, col: 2, name: 'decor_09_cursed_iron_fences' },
  ];
  await processSheet('artwork/decorative1.jpeg', 3, 3, decor1Items, decorDir);

  // 6. Decorative 2 (10 to 18)
  const decor2Items = [
    { row: 0, col: 0, name: 'decor_10_cracked_canopic_urns' },
    { row: 0, col: 1, name: 'decor_11_grave_diggers_wheelbarrow' },
    { row: 0, col: 2, name: 'decor_12_creepy_scarecrows' },
    { row: 1, col: 0, name: 'decor_13_watcher_gargoyles' },
    { row: 1, col: 1, name: 'decor_14_obsidian_altars' },
    { row: 1, col: 2, name: 'decor_15_gothic_fountains' },
    { row: 2, col: 0, name: 'decor_16_twisted_dead_trees' },
    { row: 2, col: 1, name: 'decor_17_minor_mist_portals' },
    { row: 2, col: 2, name: 'decor_18_fallen_angel_statues' },
  ];
  await processSheet('artwork/decorative2.jpeg', 3, 3, decor2Items, decorDir);

  // 7. Consumables (1 to 9 from artwork/flasks.jpeg)
  const consumablesDir = path.join(assetsDir, 'sprites', 'consumables');
  const consumableItems = [
    { row: 0, col: 0, name: 'blood_ruby' },
    { row: 0, col: 1, name: 'niflheim_frost' },
    { row: 0, col: 2, name: 'styx_essence' },
    { row: 1, col: 0, name: 'void_nectar' },
    { row: 1, col: 1, name: 'midas_tear' },
    { row: 1, col: 2, name: 'gargoyle_bile' },
    { row: 2, col: 0, name: 'spectral_sigh' },
    { row: 2, col: 1, name: 'liquid_ashes' },
    { row: 2, col: 2, name: 'widows_filter' },
  ];
  if (fs.existsSync('artwork/flasks.jpeg')) {
    await processSheet('artwork/flasks.jpeg', 3, 3, consumableItems, consumablesDir);
  }

  // 8. Backgrounds (Optimizing to 1024x1024)
  const bgDir = path.join(assetsDir, 'backgrounds');
  fs.mkdirSync(bgDir, { recursive: true });
  console.log('\nResizing backgrounds to 1024x1024...');
  const bgs = [
    { src: 'artwork/farm_bg_day.jpeg', dest: 'farm_bg_day.png' },
    { src: 'artwork/farm_bg_dawn_morning.jpeg', dest: 'farm_bg_dawn.png' },
    { src: 'artwork/farm_bg_night.jpeg', dest: 'farm_bg_night.png' },
  ];
  for (const bg of bgs) {
    const destPath = path.join(bgDir, bg.dest);
    await sharp(bg.src).resize(1024, 1024).png({ quality: 90 }).toFile(destPath);
    console.log(`Saved background: ${destPath}`);
  }

  // 9. VIP Decorations (19 to 27 from artwork/vips1.jpeg)
  const vipDecorItems = [
    { row: 0, col: 0, name: 'decor_19_fallen_king_crown' },
    { row: 0, col: 1, name: 'decor_20_blood_diamond_cluster' },
    { row: 0, col: 2, name: 'decor_21_molten_gold_chalice' },
    { row: 1, col: 0, name: 'decor_22_marble_gold_tombstone' },
    { row: 1, col: 1, name: 'decor_23_sapphire_fire_lantern' },
    { row: 1, col: 2, name: 'decor_24_solid_gold_gargoyle' },
    { row: 2, col: 0, name: 'decor_25_imprisoned_crystal_moon' },
    { row: 2, col: 1, name: 'decor_26_platinum_imperial_fountain' },
    { row: 2, col: 2, name: 'decor_27_dark_sun_niflheim' },
  ];
  if (fs.existsSync('artwork/vips1.jpeg')) {
    await processSheet('artwork/vips1.jpeg', 3, 3, vipDecorItems, decorDir, {
      xSplits: [0, 660, 1372, 2048],
      ySplits: [0, 576, 1285, 2048],
    });
  }

  console.log('\nAll assets sliced, processed, and optimized successfully!');
}

run().catch(console.error);
