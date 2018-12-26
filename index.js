/*
Step 0: download geckodriver from
https://github.com/mozilla/geckodriver/releases/ and put it in your path (e.g.,
this directory).
*/

const {Builder, By, Key, until} = require('selenium-webdriver');
const {url, user, passwd, mp3paths} = require('./PRIVATE');
const {existsSync} = require('fs');
const {join} = require('path');

(async function memrise() {
  let driver = await new Builder().forBrowser('firefox').build();
  try {
    await driver.get('https://www.memrise.com/login/');
    await driver.findElement(By.name('username')).sendKeys(user);
    await driver.findElement(By.name('password')).sendKeys(passwd, Key.RETURN);
    await driver.wait(until.titleIs('Dashboard - Memrise'), 20000);
    await driver.get(url);
    // await driver.executeScript('alert("hi")');
    await driver.executeScript(
        `Array.from(document.getElementsByClassName('show-hide btn btn-small')).forEach(x => x.click())`);
    await driver.sleep(4000);

    let trs = await driver.findElements(By.css('tr.thing'));
    let numAudioed = 0;
    for (let tr of trs) {
      let aud = await tr.findElement(By.css('td.audio[data-key]'));
      let text = await aud.getText();
      if (text.includes('no audio')) {
        let kana = await (tr.findElement(By.css('td.text[data-key="1"]'))
                              .then(n => n.getText()));
        let basefname = `${kana}.mp3`;
        let toUpload = mp3paths.map(p => join(p, basefname)).filter(existsSync);
        if (toUpload.length > 0) {
          numAudioed++;
          for (let s of toUpload) {
            console.log(`Finna upload ${s}`);
            let input = await tr.findElement(
                By.css('td.audio[data-key] div.files-add input'));
            await input.sendKeys(s);
            await driver.sleep(2000);
          }
        }
        console.log(`Uploaded ${toUpload.length} audio files for: ${kana}`);
      }
    }

  } finally {
    await driver.get('https://www.memrise.com/logout');
    await driver.quit();
  }
})()