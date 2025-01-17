const puppeteer = require("puppeteer");
const {
	PollyClient,
	SynthesizeSpeechCommand,
} = require("@aws-sdk/client-polly");
const fs = require("fs");
const { join } = require("path");
const { existsSync, createWriteStream } = require("fs");
const { Stream } = require("stream");
const { text2SSML } = require("./lojban.js");
const clc = require("cli-color");

// HELPERS
/**
 * Given a stream, save it to disk. Returns a promise that resolves after the stream is closed (hopefully the file will
 * be ready then?)
 * @param {Stream} stream
 * @param {string} filepath
 */
function audioStreamToDisk(stream, filepath) {
	if (!fs.existsSync(join(filepath, ".."))) {
		fs.mkdirSync(join(filepath, "../.."));
		fs.mkdirSync(join(filepath, ".."));
	}
	return new Promise((resolve) =>
		stream.pipe(createWriteStream(filepath)).on("close", () => resolve())
	);
}

/**
 *
 * @param {string[]} texts candidate text that might match mp3s
 * @param {string[]} voicePaths directories for each voice
 * @returns {string[]}
 * For each voice directory, we only want ONE of the input strings to match. I.e., we do NOT want to return *multiple*
 * mp3s in the same voice, because e.g., we might have audio for all-kana and all-kanji (same voice), and don't want to
 * upload both.
 */
function searchForMp3s(texts, voicePaths) {
	/** @type{string[]} */
	const ret = [];

	for (const filepath of voicePaths) {
		for (const text of texts) {
			const candidate = join(filepath, text.replace(/\//g, " ") + ".mp3");
			if (existsSync(candidate)) {
				ret.push(candidate);
				break;
			}
		}
	}
	return ret;
}

/**
 *
 * @param {{
 * url: string,
 * user: string,
 * passwd: string,
 * voices: string[],
 * voices_parent_path: tring,
 * column_indexes: number[],
 * aws_region: string,
 * aws_access_key_id: string,
 * aws_secret_access_key: string,
 * verbose: boolean,
 * bottom_first: boolean,
}} config
 */
async function main(config) {
	const voicePaths = config.voices.map((v) => join(__dirname, "voices", v));
	const polly = new PollyClient({
		region: config.aws_region,
		credentials: {
			accessKeyId: config.aws_access_key_id,
			secretAccessKey: config.aws_secret_access_key,
		},
	});

	const browser = await puppeteer.launch({ headless: false });
	const page = await browser.newPage();
	await page.goto("https://app.memrise.com/signin");

	await page.focus("#username");
	await page.keyboard.type(config.user);

	await page.focus("#password");
	await page.keyboard.type(config.passwd);
	await page.keyboard.press("Enter");

	await page.waitForNavigation();

	if (!config.url.includes("/edit")) {
		console.error(`WARNING: ${config.url} doesn't contain "edit"?`);
	}
	await page.goto(config.url);

	{
		const cookies = await page.$('a[aria-label="allow cookies"]');
		if (cookies) {
			await cookies.click();
		}
	}

	const levels = await page.$$("div.level");
	if (config.verbose) {
		console.log(clc.red.bgWhite.underline(`${levels.length} levels found`));
	}
	if (config.bottom_first) {
		levels.reverse();
	}

	for (const level of levels) {
		const levelId = await (await level.getProperty("id")).jsonValue();

		const button = await level.$(".show-hide.btn.btn-small");
		if (button) {
			await Promise.all([button.click(), page.waitForTimeout(5500)]);
			// we've expanded the level and can see all the cards inside
			let handle = "",
				name = "";
			if (config.verbose) {
				handle = await level.$eval(".level-handle", (o) =>
					o.textContent.trim()
				);
				name = await level.$eval(".level-name", (o) => o.textContent.trim());
				console.log(clc.blue(`Opened #${handle}: ${name}`));
				console.log(
					clc.yellow.bold(
						`${(await page.$$(`#${levelId} tr.thing`)).length} <tr>s found`
					)
				);
			}

			// oddly, I can't do `level.$$()` here, I have to use `page`. With the DOM element's ID, this is fast, but still
			// weird
			for (const tr of await page.$$(`#${levelId} tr.thing`)) {
				const texts = await tr.$$eval("td.cell.text[data-key]", (tds) =>
					tds.map((td) => td.innerText.trim())
				);
				// Above, we want to use `innerText` instead of `textContent`. The latter has some "Alts" padding
				/**@type{string[]} */
				let relevantTexts = config.column_indexes
					.map((n) => texts[n])
					.filter((s) => typeof s === "string" && s.length);
				if (config.omit_english) {
					relevantTexts = relevantTexts.filter((s) => !s.match(/[a-zA-Z]/));
				}
				if (config.verbose) {
					console.log(
						[
							clc.bold.red.bgWhite(`${relevantTexts.join("//")}`),
							clc.bold.cyan(handle),
							clc.bold.cyan(name),
						].join(" | ")
					);
				}

				const onlineMp3s = await tr.$$("a.audio-player[data-url]");
				if (config.verbose) {
					console.log(
						clc.cyan(`  ${onlineMp3s.length} mp3s found already online`)
					);
				}

				// Assuming we have some text that ought to be speech, are there fewer mp3s than voices?
				if (
					onlineMp3s.length < config.voices.length &&
					relevantTexts.length > 0
				) {
					// not enough mp3s have been uploaded: this row has text that should be spoken

					// look for mp3s on disk: this might be `kanji.mp3` or `kana.mp3` etc.
					const savedMp3s = searchForMp3s(relevantTexts, voicePaths);
					if (config.verbose) {
						console.log(
							clc.cyan(
								`  ${savedMp3s.length} mp3s locally available: ` +
									`${savedMp3s
										.map((s) => s.replace(__dirname + "/voices", "…"))
										.join(", ")}`
							)
						);
					}
					// did we find an mp3 for each voice?
					if (savedMp3s.length < config.voices.length) {
						// we don't have enough audio saved to disk for this row. Let's text-to-speech `relevantTexts[0]`
						const Text = relevantTexts[0];
						// console.log(`  text: ` + clc.bold.blue(Text));
						for (const voice of config.voices) {
							const mp3path = join(
								join(__dirname, "voices", voice),
								Text.replace(/\//g, " ") + ".mp3"
							);
							if (existsSync(mp3path)) {
								continue;
							} // don't rerun Polly if we don't need to!
							if (config.verbose) {
								console.log(
									`  Generating ` + clc.red.italic(Text) + ` with ${voice}`
								);
							}
							const data = await polly.send(
								new SynthesizeSpeechCommand({
									VoiceId: voice,
									OutputFormat: "mp3",
									Text: config.TextType === "ssml" ? text2SSML(Text) : Text,
									Engine: "neural",
									TextType: config.TextType,
								})
							);
							await audioStreamToDisk(data.AudioStream, mp3path);
							if (config.verbose) {
								console.log(
									`  Saved ` + clc.green(`${mp3path.replace(__dirname, "…")}`)
								);
							}
						}
					}
				}

				const savedMp3s = searchForMp3s(relevantTexts, voicePaths);
				if (config.verbose) {
					console.log(
						`  ${savedMp3s.length} mp3s locally available: ` +
							clc.italic(
								`${savedMp3s.map((s) => s.replace(__dirname, "…")).join(", ")}`
							)
					);
				}

				if (savedMp3s.length > onlineMp3s.length && onlineMp3s.length === 0) {
					// delete all audio before we upload these
					if (onlineMp3s.length > 0) {
						await (await tr.$("td.audio button.dropdown-toggle")).click();
						page.waitForTimeout(1000);
						let toDelete = await tr.$("td.audio i.ico.ico-trash");
						while (toDelete) {
							await toDelete.click();
							if (config.verbose) {
								console.log("  Deleted one audio");
							}
							await page.waitForTimeout(1500);

							await (await tr.$("td.audio button.dropdown-toggle")).click();
							await page.waitForTimeout(1000);
							toDelete = await tr.$("td.audio i.ico.ico-trash");
						}
					}

					// upload
					for (const mp3 of savedMp3s) {
						let upload = await tr.$(
							"td.audio[data-key] div.files-add input[type=file]"
						);
						while (!upload) {
							await page.waitForTimeout(2000);
							upload = await tr.$(
								"td.audio[data-key] div.files-add input[type=file]"
							);
						}
						await upload.uploadFile(mp3);

						if (config.verbose) {
							console.log(
								`  Uploaded ` +
									clc.green.italic(`${mp3.replace(__dirname, "…")}`)
							);
						}
						await page.waitForTimeout(2000);
					}
				}
			}
		}
	}

	await browser.close();
}

if (module === require.main) {
	(async () => {
		let pathToConfig = join(__dirname, process.argv[2] || "config.js");
		if (!pathToConfig.startsWith("/")) {
			pathToConfig = join(".BLA_BLA", pathToConfig).replace("BLA_BLA", "");
		}
		if (existsSync(pathToConfig)) {
			var config = require(pathToConfig);
			await main(config);
		} else {
			console.error(`${pathToConfig} not found`);
		}
	})();
}
