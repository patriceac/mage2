// Playwright CLI callback. Run after confirming New game in the QA browser.
// All progress is obtained from visible controls; no save or controller mutation.
async page => {
  const button = name => page.getByRole('button', { name, exact: true });
  const drain = async () => {
    for (let i = 0; i < 35; i++) {
      if (!await button('Continue').count()) return;
      await button('Continue').click();
    }
    throw new Error('Conversation did not terminate');
  };
  const act = async name => { await button(name).click(); await drain(); };
  const inventory = async name => {
    const toggle = page.getByRole('button', { name: /^Open inventory/ });
    if (await toggle.count()) await toggle.click();
    await button(name).click();
  };

  // Verify keyboard activation with the real browser keyboard implementation.
  await button('Entrer aux archives').press('Enter');
  await act('Étudier le plan hydraulique');
  await act('Prendre la goupille de bronze');
  if (await button('Prendre la goupille de bronze').count()) throw new Error('Pickup did not disappear');
  await button('Revenir au cloître').hover();
  await page.screenshot({ path: 'output/playwright/last-kindness-archive-exit-fixed.png' });
  // The click is at the visible doorway, independently of the hotspot rectangle.
  const frame = await page.locator('.mage2-player__scene-surface').boundingBox();
  await page.mouse.click(frame.x + frame.width * .19, frame.y + frame.height * .30);
  await button('Descendre vers le moulin').waitFor();
  await act('Descendre vers le moulin');
  await act('Prendre l’étai de chêne');
  await act('Remonter au cloître');
  await inventory('Goupille de bronze');
  await button('Étayer la passerelle').click();
  if (!await button('Étayer la passerelle').count()) throw new Error('Wrong item repaired the bridge');
  await inventory('Étai de chêne');
  await act('Étayer la passerelle');
  await button('Examiner la passerelle étayée').waitFor();
  await act('Entrer dans l’infirmerie');
  await button('Examiner les brancards').waitFor();
  await act('Parler à Ondine');
  await act('Parler à Sabine');
  await act('Revenir au cloître');
  await act('Tirer la corde de cloche');
  await act('Tirer la corde de cloche');
  await act('Entrer au local des vannes');
  await inventory('Goupille de bronze');
  await act('Insérer la goupille dans l’axe');
  await button('Examiner la goupille installée').waitFor();
  if (await page.locator('.mage2-player__hotspot-visual img').count()) throw new Error('Installed inventory sprite still overlays the scene');
  await page.screenshot({ path: 'output/playwright/last-kindness-pin-integrated.png' });
  await act('Fermer la vanne d’admission');
  await button('Menu').click();
  await button('Save game').click();
  await page.reload();
  await button('Continue').click();
  await button('Examiner la goupille installée').waitFor();
  await act('Ouvrir l’exutoire droit');
  await page.screenshot({ path: 'output/playwright/last-kindness-repair-complete.png' });
  await act('Revenir au cloître');
  await act('Entrer dans l’infirmerie');
  await button('Examiner les lits vides').waitFor();
  await button('Parler à Ondine').click();
  await page.screenshot({ path: 'output/playwright/last-kindness-repair-aftermath.png' });
  await drain();
  console.log(JSON.stringify({passed:true,route:'repair',method:'actual official runtime UI',checks:['keyboard activation','doorway pointer alignment','pickup disappears','wrong item preserves bridge','brace consumed','evacuation','pin baked into scene without sprite','save/reload after pin and intake','repair aftermath']}));
}
