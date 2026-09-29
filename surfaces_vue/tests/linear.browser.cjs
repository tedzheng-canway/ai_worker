const { fixture, server, chromium, expect, assert } = require('./p0.browser.cjs');
const path = require('node:path');

function luminance(hex) {
  const rgb = hex.trim().slice(1).match(/../g).map(v => parseInt(v,16)/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4);
  return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({channel:process.env.P0_BROWSER_CHANNEL || 'msedge',headless:true});
  try {
    const {page,close}=await fixture(browser,`http://127.0.0.1:${server.address().port}`);
    const screenshot=name=>page.screenshot({path:path.join(__dirname,`../dist/linear-${name}.png`)});
    await page.setViewportSize({width:1440,height:960});
    await page.getByRole('button',{name:'＋ 新对话',exact:true}).click();
    await expect(page.locator('.hero')).toBeVisible();
    await page.evaluate(()=>document.fonts.ready);
    assert(await page.evaluate(()=>[...document.fonts].some(face=>face.family==='Inter' && face.status==='loaded')));
    assert.equal(await page.locator('.hero h1').evaluate(el=>getComputedStyle(el).textShadow),'none');
    assert.equal(await page.locator('.main').evaluate(el=>getComputedStyle(el).backgroundImage),'none');
    await screenshot('chat-midnight');
    await page.getByRole('button',{name:/切换石墨外观/}).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
    await screenshot('chat-graphite');
    for(const theme of ['light','dark']) {
      await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
      const tokens=await page.evaluate(()=>{
        const css=getComputedStyle(document.documentElement);
        return Object.fromEntries(['--ink','--muted','--faint','--accent','--canvas','--paper','--accent-soft'].map(key=>[key,css.getPropertyValue(key).trim()]));
      });
      for(const foreground of ['--ink','--muted','--faint','--accent']) {
        for(const background of ['--canvas','--paper','--accent-soft']) {
          const contrast=(luminance(tokens[foreground])+.05)/(luminance(tokens[background])+.05);
          assert(contrast>=4.5,`${theme}: ${foreground} on ${background}: ${contrast}`);
        }
      }
    }
    await page.getByRole('button',{name:/切换深黑外观/}).click();
    await page.locator('.surface-nav button').filter({hasText:'设置'}).click();
    await expect(page.locator('.settings-page h1')).toHaveText('通用');
    const centered=await page.evaluate(()=>{
      const main=document.querySelector('.main').getBoundingClientRect();
      const form=document.querySelector('.settings-fields').getBoundingClientRect();
      return Math.abs((main.left+main.right-form.left-form.right)/2)<2;
    });
    assert(centered,'Settings content must be centered within the main workspace');
    await screenshot('settings');
    await page.getByTitle('收起侧边栏').click();
    await page.setViewportSize({width:390,height:844});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await screenshot('settings-mobile');
    await page.emulateMedia({reducedMotion:'reduce'});
    const motion=await page.locator('.settings-page button').first().evaluate(el=>getComputedStyle(el).transitionDuration);
    assert.equal(motion,'0s');
    await close();
    console.log('PASS: Linear midnight/graphite palettes, text token contrast, mobile layout, reduced motion and visual snapshots');
  } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
