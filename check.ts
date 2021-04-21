import assert from "assert";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const range = (size: number, startAt: number = 0): number[] =>
  [...Array(size).keys()].map((i) => i + startAt);

/* SETTINGS */
const COUNTY = "Baden-Württemberg";
const NUM_IMPFZENTRUM = 52;
const DEFAULT_RUN_BATCH_SIZE = 10;

puppeteer
  .launch({
    // @ts-expect-error
    args: [
      "--window-size=1600,1200",
      "--no-sandbox",
      "--disable-setuid-sandbox",
    ],
    headless: true,
  })
  .then(async (browser) => {
    console.log("Running check..");

    const runCheck = async (i: number) => {
      let impfzentrumName;
      try {
        const page = await browser.newPage();

        await page.goto("https://www.impfterminservice.de/impftermine", {
          waitUntil: "networkidle2",
        });

        const selectElements = await page.$$("label > select + span");
        assert(selectElements.length === 2);
        const [selectBundesland, selectImpfzentrum] = selectElements;

        selectBundesland.click();
        await page.waitForXPath(`//li[contains(.,"${COUNTY}")]`);
        await page
          .$x(`//li[contains(.,"${COUNTY}")]`)
          .then(([elem]) => elem.click());
        await page.waitForXPath("//li[not(@aria-disabled)]", { hidden: true });

        selectImpfzentrum.click();
        await page.waitForXPath('//li[text()="Bitte auswählen"]');
        const impfzentrumOptions = await page.$x("//li[not(@aria-disabled)]");
        assert(impfzentrumOptions.length === NUM_IMPFZENTRUM);
        impfzentrumName = await page
          .evaluate((el) => el.textContent, impfzentrumOptions[i])
          .then((text) => text.trim());
        impfzentrumOptions[i].click();
        await page.waitForXPath("//li[not(@aria-disabled)]", { hidden: true });

        await page
          .$x('//button[contains(.,"Zum Impfzentrum")]')
          .then(([elem]) => elem.click());

        await page.waitForXPath('//span[contains(.,"(Anspruch prüfen)")]');

        await page
          .$x('//span[contains(.,"(Anspruch prüfen)")]')
          .then(([elem]) => elem.click());

        await page.waitForXPath(
          '//div[contains(.,"Bitte warten, wir suchen verfügbare Termine in Ihrer Region.")]',
          { hidden: true }
        );

        const noAppointments = await page.$x(
          '//div[contains(.,"Es wurden keine freien Termine in Ihrer Region gefunden.")]'
        );

        if (noAppointments.length === 0) {
          console.log(`Yes: ${impfzentrumName}`);
          await page.screenshot({
            path: `${impfzentrumName}.png`,
            fullPage: true,
          });
        } else {
          console.log(`No: ${impfzentrumName}`);
        }
      } catch (e) {
        console.log(`Timeout: ${impfzentrumName ?? i}`);
      }
    };

    const numOfRuns = Math.floor(NUM_IMPFZENTRUM / DEFAULT_RUN_BATCH_SIZE);
    const runs = range(Math.floor(numOfRuns)).fill(DEFAULT_RUN_BATCH_SIZE);
    const remainder = NUM_IMPFZENTRUM % DEFAULT_RUN_BATCH_SIZE;
    if (remainder) {
      runs[numOfRuns - 1] += remainder;
    }

    for (let i = 0; i < runs.length; i++) {
      await Promise.all(
        range(runs[i], i * DEFAULT_RUN_BATCH_SIZE).map(runCheck)
      );
    }

    console.log(`All done, check the screenshots. ✨`);
    await browser.close();
  });
