const { fixture, server, chromium, expect, assert } = require('./p0.browser.cjs');
const path = require('node:path');

function rgb(color) {
  if (color.startsWith('#')) return [...color.slice(1).match(/../g).map(v => parseInt(v, 16)), 1];
  const values = color.match(/[\d.]+/g).map(Number);
  return [...values.slice(0, 3), values[3] ?? 1];
}
function luminance(color) {
  const [r, g, b] = color.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return r * .2126 + g * .7152 + b * .0722;
}
function contrast(foreground, background) {
  const [r, g, b, alpha] = rgb(foreground);
  const bg = rgb(background).slice(0, 3);
  const fg = [r, g, b].map((value, i) => value * alpha + bg[i] * (1 - alpha));
  return (luminance(fg) + .05) / (luminance(bg) + .05);
}

async function auditAppearance(page) {
  const violations = await page.evaluate(() => {
    const violations = [];
    for (const el of document.querySelectorAll('#app, #app *')) {
      if (!el.getClientRects().length) continue;
      for (const pseudo of [null, '::before', '::after']) {
        const css = getComputedStyle(el, pseudo);
        if (pseudo && ['none', 'normal'].includes(css.content)) continue;
        const name = `${el.tagName.toLowerCase()}.${el.classList.value.replaceAll(' ', '.')}${pseudo || ''}`;
        if (css.backgroundImage !== 'none') violations.push(`${name}: background image ${css.backgroundImage}`);
        if (css.boxShadow !== 'none') violations.push(`${name}: shadow ${css.boxShadow}`);
        if (css.animationName !== 'none') violations.push(`${name}: animation ${css.animationName}`);
        for (const corner of ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius']) {
          if (parseFloat(css[corner]) > 12) violations.push(`${name}: ${corner} ${css[corner]}`);
        }
        for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
          if (parseFloat(css[`border${side}Width`]) > 1) violations.push(`${name}: border ${css[`border${side}Width`]}`);
        }
        const properties = css.transitionProperty.split(',').map(value => value.trim());
        if (css.transitionDuration.split(',').some(value => parseFloat(value) > 0) && properties.some(value => !['background-color', 'border-color', 'color', 'none'].includes(value))) violations.push(`${name}: transition ${css.transitionProperty}`);
      }
    }
    return violations;
  });
  assert.deepEqual(violations, [], 'Visible components must follow the macOS material and motion rules');
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: process.env.P0_BROWSER_CHANNEL || 'msedge', headless: true });
  let page;
  try {
    const context = await fixture(browser, `http://127.0.0.1:${server.address().port}`);
    page = context.page;
    const screenshot = name => page.screenshot({ path: path.join(__dirname, `../dist/macos-vibrancy-${name}.png`), animations: 'disabled' });
    const noOverflow = async () => assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Page must fit the viewport');
    await page.setViewportSize({ width: 1440, height: 960 });
    await expect(page.locator('html')).toHaveAttribute('data-style', 'macos-vibrancy');
    await page.getByRole('button', { name: '＋ 新对话', exact: true }).click();
    await expect(page.locator('.hero')).toBeVisible();
    const sidebar = await page.locator('.sidebar').evaluate(el => {
      const css = getComputedStyle(el);
      return { background: css.backgroundColor, filter: css.backdropFilter, border: css.borderRightWidth };
    });
    assert.equal(sidebar.background, 'rgba(28, 28, 30, 0.8)');
    assert.equal(sidebar.filter, 'blur(24px)');
    assert.equal(sidebar.border, '1px');
    assert((await page.locator('.hero h1').evaluate(el => getComputedStyle(el).fontFamily)).includes('Georgia'));
    assert(!/Inter|Roboto|Geist/.test(await page.locator('.main').evaluate(el => getComputedStyle(el).fontFamily)));
    await auditAppearance(page);
    await noOverflow();
    await screenshot('chat-graphite');
    const suggestion = page.locator('.suggestions button').first();
    const before = await suggestion.boundingBox();
    await suggestion.hover();
    assert.deepEqual(await suggestion.boundingBox(), before, 'Hover must not move or scale controls');
    assert.equal(await suggestion.evaluate(el => getComputedStyle(el).transform), 'none');
    await auditAppearance(page);

    await page.setViewportSize({ width: 1280, height: 720 });
    assert(await page.locator('.sidebar-footer').evaluate(el => el.getBoundingClientRect().bottom <= innerHeight), 'Sidebar status and theme control must fit a laptop screen');
    assert(await page.evaluate(() => document.querySelector('.suggestions').getBoundingClientRect().bottom <= document.querySelector('.conversation').getBoundingClientRect().bottom), 'Welcome actions must fit above the composer');
    await screenshot('chat-laptop');
    await page.setViewportSize({ width: 1440, height: 960 });

    await page.getByRole('button', { name: /切换深灰外观/ }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await screenshot('chat-dark');
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      const tokens = await page.evaluate(() => {
        const css = getComputedStyle(document.documentElement);
        return Object.fromEntries(['--ink', '--muted', '--faint', '--canvas', '--content', '--panel', '--paper', '--deep', '--accent'].map(key => [key, css.getPropertyValue(key).trim()]));
      });
      assert.equal(tokens['--accent'], '#0a84ff');
      for (const background of ['--canvas', '--content', '--panel', '--paper', '--deep']) {
        assert(['#1c1c1e', '#2c2c2e', '#3a3a3c'].includes(tokens[background]));
        for (const foreground of ['--ink', '--muted', '--faint']) {
          assert(contrast(tokens[foreground], tokens[background]) >= 4.5, `${theme}: ${foreground} on ${background} must be readable`);
        }
      }
    }
    await page.getByRole('button', { name: /切换石墨外观/ }).click();
    await page.getByRole('button', { name: '梳理项目结构 →', exact: true }).click();
    await expect(page.locator('.composer textarea')).toHaveValue('帮我梳理这个项目的结构和核心模块');
    await page.getByRole('button', { name: '选择智能体', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.select-popover')).toBeVisible();
    await auditAppearance(page);
    await screenshot('menu');
    await page.keyboard.press('Escape');
    await expect(page.locator('.select-popover')).toHaveCount(0);
    await page.getByRole('button', { name: '权限与项目', exact: true }).click();
    await expect(page.locator('.detail-panel')).toBeVisible();
    await auditAppearance(page);
    await screenshot('permissions');
    await page.getByRole('button', { name: '关闭权限面板' }).click();

    await page.locator('.surface-nav button').filter({ hasText: '设置' }).click();
    await expect(page.locator('.settings-page h1')).toHaveText('通用');
    assert(await page.evaluate(() => document.querySelector('.subnav').getBoundingClientRect().right <= document.querySelector('.settings-page').getBoundingClientRect().left), 'Settings categories must form the middle rail');
    await auditAppearance(page);
    await screenshot('settings');
    await page.locator('.subnav').getByRole('button', { name: '上下文', exact: true }).click();
    await expect(page.getByLabel('触发阈值（%）')).toBeVisible();
    await auditAppearance(page);
    await screenshot('context');
    await page.getByTitle('收起侧边栏').click();
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      await noOverflow();
      await expect(page.locator('.settings-page h1')).toBeVisible();
      assert(await page.locator('.main').evaluate(el => el.getBoundingClientRect().width >= innerWidth - 1), 'Collapsed sidebar must leave a usable workspace');
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await auditAppearance(page);
    await screenshot('settings-mobile');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.locator('.settings-page button').first().evaluate(el => getComputedStyle(el).transitionDuration), '0s');
    await context.close();
    console.log('PASS: macOS depth system, sidebar vibrancy, serif headings, contrast, restrained interaction, keyboard menus and responsive layout');
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(__dirname, '../dist/macos-vibrancy-failure.png') });
    throw error;
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
